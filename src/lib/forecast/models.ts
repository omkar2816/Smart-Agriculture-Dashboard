/**
 * Transparent time-series baselines for hourly sensor series.
 *
 *  - persistence:   forecast = last observed hourly mean
 *  - damped-holt:   additive damped-trend exponential smoothing (ETS A,Ad,N)
 *  - seasonal-level: additive 24 h seasonal exponential smoothing (ETS A,N,A)
 *
 * Parameters are chosen by grid search on one-step-ahead squared error.
 * Model choice and uncertainty come from a rolling-origin back-test on the
 * same data, so every reported interval is empirical, not assumed.
 *
 * Known limitation: parameters are tuned on the same history that is used for
 * the back-test (no separate hold-out), so back-test errors are slightly
 * optimistic. This is stated in the UI and README.
 */

export type ModelId = "persistence" | "damped-holt" | "seasonal-level";

export const MODEL_LABELS: Record<ModelId, string> = {
  persistence: "Persistence (last value carried forward)",
  "damped-holt": "Damped-trend exponential smoothing",
  "seasonal-level": "Seasonal (24 h) exponential smoothing",
};

export const SEASON = 24;
export const MAX_HORIZON = 24;
export const MIN_BACKTEST_ORIGINS = 8;
/** z for a central 80% interval under approximately normal errors. */
export const Z80 = 1.2816;

export interface FittedModel {
  id: ModelId;
  params: Record<string, number>;
  /** First origin index that has a fully initialised state. */
  firstOrigin: number;
  /** Forecast `h` steps ahead given data observed up to and including index `t`. */
  forecastAt: (t: number, h: number) => number;
}

export function fitPersistence(y: number[]): FittedModel {
  return { id: "persistence", params: {}, firstOrigin: 0, forecastAt: (t) => y[t] };
}

export function fitDampedHolt(y: number[]): FittedModel | null {
  const n = y.length;
  if (n < 6) return null;
  const alphas = [0.2, 0.4, 0.6, 0.8];
  const betas = [0.05, 0.1, 0.2];
  const phis = [0.8, 0.9, 0.95];
  let best: { sse: number; a: number; b: number; p: number; L: number[]; B: number[] } | null = null;

  for (const a of alphas) {
    for (const b of betas) {
      for (const p of phis) {
        const L = new Array<number>(n);
        const B = new Array<number>(n);
        const k = Math.min(3, n - 1);
        L[0] = y[0];
        B[0] = (y[k] - y[0]) / k;
        let sse = 0;
        for (let t = 1; t < n; t++) {
          const pred = L[t - 1] + p * B[t - 1];
          const e = y[t] - pred;
          if (t >= 3) sse += e * e;
          L[t] = pred + a * e;
          B[t] = p * B[t - 1] + a * b * e;
        }
        if (!best || sse < best.sse) best = { sse, a, b, p, L, B };
      }
    }
  }
  if (!best) return null;
  const { L, B, p, a, b } = best;
  return {
    id: "damped-holt",
    params: { alpha: a, beta: b, phi: p },
    firstOrigin: 3,
    forecastAt: (t, h) => L[t] + B[t] * ((p * (1 - Math.pow(p, h))) / (1 - p)),
  };
}

export function fitSeasonalLevel(y: number[], m: number = SEASON): FittedModel | null {
  const n = y.length;
  if (n < 3 * m) return null; // need at least three full cycles to learn and validate a daily pattern
  const alphas = [0.1, 0.3, 0.5];
  const gammas = [0.05, 0.2, 0.4];
  let best: { sse: number; a: number; g: number; L: number[]; S: number[] } | null = null;

  for (const a of alphas) {
    for (const g of gammas) {
      const L = new Array<number>(n).fill(0);
      const S = new Array<number>(n).fill(0);
      let l0 = 0;
      for (let i = 0; i < m; i++) l0 += y[i];
      l0 /= m;
      for (let i = 0; i < m; i++) {
        S[i] = y[i] - l0;
        L[i] = l0;
      }
      let level = l0;
      let sse = 0;
      for (let t = m; t < n; t++) {
        const pred = level + S[t - m];
        const e = y[t] - pred;
        sse += e * e;
        level += a * e;
        S[t] = S[t - m] + g * (1 - a) * e;
        L[t] = level;
      }
      if (!best || sse < best.sse) best = { sse, a, g, L, S };
    }
  }
  if (!best) return null;
  const { L, S, a, g } = best;
  return {
    id: "seasonal-level",
    params: { alpha: a, gamma: g, period: m },
    firstOrigin: m + 12,
    forecastAt: (t, h) => {
      const k = Math.ceil(h / m);
      return L[t] + S[t + h - m * k];
    },
  };
}

export interface HorizonError {
  n: number;
  mae: number;
  rmse: number;
  /** Share of back-test errors inside +/- Z80*rmse (sanity check on the interval). */
  coverage: number;
}

/** Rolling-origin errors for horizons 1..MAX_HORIZON, evaluated from `startOrigin`. */
export function backtest(
  y: number[],
  model: FittedModel,
  startOrigin: number,
): Array<HorizonError | null> {
  const n = y.length;
  const out: Array<HorizonError | null> = new Array(MAX_HORIZON + 1).fill(null);
  for (let h = 1; h <= MAX_HORIZON; h++) {
    const errs: number[] = [];
    for (let t = Math.max(startOrigin, model.firstOrigin); t + h < n; t++) {
      errs.push(y[t + h] - model.forecastAt(t, h));
    }
    if (!errs.length) continue;
    const mae = errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length;
    const rmse = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
    const inside = errs.filter((e) => Math.abs(e) <= Z80 * rmse).length / errs.length;
    out[h] = { n: errs.length, mae, rmse, coverage: inside };
  }
  return out;
}
