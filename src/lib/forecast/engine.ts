import { METRICS } from "@/lib/data/normalize";
import {
  MAX_HORIZON,
  MIN_BACKTEST_ORIGINS,
  MODEL_LABELS,
  SEASON,
  Z80,
  backtest,
  fitDampedHolt,
  fitPersistence,
  fitSeasonalLevel,
  type FittedModel,
  type HorizonError,
  type ModelId,
} from "@/lib/forecast/models";
import type { NumericMetric, Reading } from "@/lib/types";

export const HORIZONS = [6, 12, 24] as const;
export type Horizon = (typeof HORIZONS)[number];

const HOUR = 3_600_000;
/** Minimum contiguous hourly points before any numerical forecast is shown. */
export const MIN_TRAINING_HOURS = 12;
/** Maximum number of consecutive empty hours bridged by linear interpolation. */
const MAX_INTERP_GAP_H = 2;
/** The newest reading must be at most this old for a forecast to be issued. */
const MAX_DATA_AGE_H = 3;
export const TRAINING_WINDOW_H = 7 * 24;

export interface ForecastPoint {
  horizonHours: number;
  /** Epoch ms the value is predicted FOR. */
  targetTime: number;
  value: number;
  /** Central 80% interval from empirical back-test error; null if not justified by data. */
  lower: number | null;
  upper: number | null;
  model: ModelId;
}

export interface ModelSelection {
  horizonHours: Horizon;
  model: ModelId;
  modelLabel: string;
  backtestOrigins: number;
  maeBacktest: number | null;
  maePersistence: number | null;
  /** 1 - MAE_model / MAE_persistence (positive = better than carrying the last value forward). */
  skill: number | null;
  /** Fraction of back-test errors that fell inside the stated interval. */
  intervalCoverage: number | null;
  intervalJustified: boolean;
}

export type ForecastStatus = "ok" | "insufficient";

export interface MetricForecast {
  metric: NumericMetric;
  unit: string;
  label: string;
  status: ForecastStatus;
  /** Present when status === "insufficient". */
  reason?: string;
  /** When this forecast was computed. */
  generatedAt: number;
  /** Time of the last data point the forecast is based on (end of last hourly bucket used). */
  basedOnUntil: number | null;
  lastObserved: number | null;
  trainingHours: number;
  interpolatedHours: number;
  /** True if irrigation commands occurred inside the training window (model assumes none in the future). */
  irrigationInWindow: boolean;
  /** Headline points at 6, 12, 24 h. */
  points: ForecastPoint[];
  /** Hourly path 1..24 h used to draw the chart. */
  path: ForecastPoint[];
  selections: ModelSelection[];
  /** Human-readable inputs behind the numbers. */
  factors: string[];
  /** Recent history actually used (hourly means) for plotting. */
  history: Array<{ t: number; v: number }>;
}

export interface ForecastOptions {
  now?: number;
  /** For soil moisture: discard history before this time (end of latest irrigation). */
  trainingStartT?: number | null;
  irrigationInWindow?: boolean;
}

interface Hourly {
  startBucket: number;
  values: Array<number | null>;
  interpolated: boolean[];
}

/** Hourly means over the window; short gaps bridged by interpolation; longer gaps stay null. */
export function resampleHourly(readings: Reading[], key: NumericMetric): Hourly | null {
  let first = Infinity;
  let last = -Infinity;
  const sums = new Map<number, { s: number; n: number }>();
  for (const r of readings) {
    const v = r[key];
    if (v === null) continue;
    const b = Math.floor(r.t / HOUR);
    first = Math.min(first, b);
    last = Math.max(last, b);
    const acc = sums.get(b);
    if (acc) {
      acc.s += v;
      acc.n++;
    } else sums.set(b, { s: v, n: 1 });
  }
  if (!Number.isFinite(first)) return null;
  const len = last - first + 1;
  const values: Array<number | null> = new Array(len).fill(null);
  const interpolated: boolean[] = new Array(len).fill(false);
  for (const [b, acc] of sums) values[b - first] = acc.s / acc.n;

  // Bridge short interior gaps.
  let i = 0;
  while (i < len) {
    if (values[i] !== null) {
      i++;
      continue;
    }
    let j = i;
    while (j < len && values[j] === null) j++;
    const gap = j - i;
    if (i > 0 && j < len && gap <= MAX_INTERP_GAP_H) {
      const a = values[i - 1] as number;
      const b = values[j] as number;
      for (let k = 0; k < gap; k++) {
        values[i + k] = a + ((b - a) * (k + 1)) / (gap + 1);
        interpolated[i + k] = true;
      }
    }
    i = j;
  }
  return { startBucket: first, values, interpolated };
}

function insufficient(
  metric: NumericMetric,
  reason: string,
  now: number,
  extra: Partial<MetricForecast> = {},
): MetricForecast {
  const meta = METRICS[metric];
  return {
    metric,
    unit: meta.unit,
    label: meta.label,
    status: "insufficient",
    reason,
    generatedAt: now,
    basedOnUntil: null,
    lastObserved: null,
    trainingHours: 0,
    interpolatedHours: 0,
    irrigationInWindow: false,
    points: [],
    path: [],
    selections: [],
    factors: [],
    history: [],
    ...extra,
  };
}

function clampToRange(metric: NumericMetric, v: number): number {
  const { min, max } = METRICS[metric];
  if (metric === "humidity" || metric === "soil1" || metric === "soil2") return Math.min(max, Math.max(min, v));
  return v;
}

function slopeLastHours(y: number[], hours: number): number | null {
  const m = y.slice(-hours);
  if (m.length < 3) return null;
  const n = m.length;
  const mx = (n - 1) / 2;
  const my = m.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (i - mx) ** 2;
    sxy += (i - mx) * (m[i] - my);
  }
  return sxx ? sxy / sxx : null;
}

/**
 * Forecast one metric 1..24 h ahead from raw readings (ascending by time).
 * Returns status "insufficient" with an explicit reason instead of guessing.
 */
export function forecastMetric(
  allReadings: Reading[],
  metric: NumericMetric,
  opts: ForecastOptions = {},
): MetricForecast {
  const now = opts.now ?? Date.now();
  const meta = METRICS[metric];
  const irrigationInWindow = opts.irrigationInWindow ?? false;

  if (!allReadings.length) return insufficient(metric, "No readings are stored yet.", now);

  const newest = allReadings[allReadings.length - 1].t;
  if (now - newest > MAX_DATA_AGE_H * HOUR) {
    return insufficient(
      metric,
      `The newest reading is more than ${MAX_DATA_AGE_H} hours old, so a forecast would be extrapolating across an outage.`,
      now,
    );
  }

  const windowStart = newest - TRAINING_WINDOW_H * HOUR;
  let readings = allReadings.filter((r) => r.t >= windowStart);
  let usedTrimmed = false;
  if (opts.trainingStartT) {
    const trimmed = readings.filter((r) => r.t >= (opts.trainingStartT as number));
    const h = resampleHourly(trimmed, metric);
    const run = h ? trailingRun(h) : null;
    if (run && run.y.length >= MIN_TRAINING_HOURS) {
      readings = trimmed;
      usedTrimmed = true;
    }
  }

  const hourly = resampleHourly(readings, metric);
  if (!hourly) return insufficient(metric, `No valid ${meta.label.toLowerCase()} readings in the training window.`, now);
  const run = trailingRun(hourly);
  if (!run || run.y.length < MIN_TRAINING_HOURS) {
    return insufficient(
      metric,
      `Only ${run?.y.length ?? 0} consecutive hours of data are available; at least ${MIN_TRAINING_HOURS} are needed. Readings will keep accumulating.`,
      now,
      { trainingHours: run?.y.length ?? 0 },
    );
  }

  const y = run.y;
  const n = y.length;
  const interpolatedHours = run.interpolated.filter(Boolean).length;
  if (interpolatedHours / n > 0.25) {
    return insufficient(
      metric,
      "More than 25% of the hourly values would have to be interpolated because of gaps in the data.",
      now,
      { trainingHours: n, interpolatedHours },
    );
  }

  // Fit candidates
  const persistence = fitPersistence(y);
  const holt = fitDampedHolt(y);
  const seasonal = fitSeasonalLevel(y, SEASON);
  const candidates: FittedModel[] = [persistence, ...(holt ? [holt] : []), ...(seasonal ? [seasonal] : [])];
  // Evaluate every candidate on the same origins so the comparison is fair.
  const startOrigin = Math.max(...candidates.map((c) => c.firstOrigin));
  const errors = new Map<ModelId, Array<HorizonError | null>>();
  for (const c of candidates) errors.set(c.id, backtest(y, c, startOrigin));

  const choose = (h: Horizon): { model: FittedModel; sel: ModelSelection } => {
    const pe = errors.get("persistence")?.[h] ?? null;
    let best: FittedModel = persistence;
    let bestMae = pe && pe.n >= MIN_BACKTEST_ORIGINS ? pe.mae : Infinity;
    for (const c of candidates) {
      if (c.id === "persistence") continue;
      const e = errors.get(c.id)?.[h];
      if (!e || e.n < MIN_BACKTEST_ORIGINS) continue;
      // Require a 2% gain over the incumbent so complexity has to earn its place.
      if (e.mae < bestMae * 0.98) {
        best = c;
        bestMae = e.mae;
      }
    }
    const be = errors.get(best.id)?.[h] ?? null;
    const justified = !!be && be.n >= MIN_BACKTEST_ORIGINS;
    const skill = justified && pe && pe.mae > 0 ? 1 - be!.mae / pe.mae : null;
    return {
      model: best,
      sel: {
        horizonHours: h,
        model: best.id,
        modelLabel: MODEL_LABELS[best.id],
        backtestOrigins: be?.n ?? 0,
        maeBacktest: justified ? be!.mae : null,
        maePersistence: pe && pe.n >= MIN_BACKTEST_ORIGINS ? pe.mae : null,
        skill,
        intervalCoverage: justified ? be!.coverage : null,
        intervalJustified: justified,
      },
    };
  };

  const chosen = { 6: choose(6), 12: choose(12), 24: choose(24) } as Record<Horizon, ReturnType<typeof choose>>;
  const bucketFor = (h: number): Horizon => (h <= 6 ? 6 : h <= 12 ? 12 : 24);

  const lastBucketStart = (hourly.startBucket + run.endIndex) * HOUR;
  // An hourly mean is attributed to the middle of its bucket; horizon h = h buckets later.
  const anchor = lastBucketStart + HOUR / 2;
  let newestValid = newest;
  for (let i = readings.length - 1; i >= 0; i--) {
    if (readings[i][metric] !== null) {
      newestValid = readings[i].t;
      break;
    }
  }

  const pointFor = (h: number): ForecastPoint => {
    const { model } = chosen[bucketFor(h)];
    const err = errors.get(model.id)?.[h] ?? null;
    const raw = model.forecastAt(n - 1, h);
    const value = clampToRange(metric, raw);
    const justified = !!err && err.n >= MIN_BACKTEST_ORIGINS;
    return {
      horizonHours: h,
      targetTime: anchor + h * HOUR,
      value,
      lower: justified ? clampToRange(metric, raw - Z80 * err!.rmse) : null,
      upper: justified ? clampToRange(metric, raw + Z80 * err!.rmse) : null,
      model: model.id,
    };
  };

  const path = Array.from({ length: MAX_HORIZON }, (_, i) => pointFor(i + 1));
  const points = HORIZONS.map((h) => path[h - 1]);
  const selections = HORIZONS.map((h) => chosen[h].sel);

  const slope6 = slopeLastHours(y, 6);
  const mean24 = y.slice(-24).reduce((s, v) => s + v, 0) / Math.min(24, n);
  const factors: string[] = [
    `Trained on ${n} consecutive hourly means${interpolatedHours ? ` (${interpolatedHours} interpolated)` : ""} ending at the newest reading.`,
    `Last observed hourly mean: ${y[n - 1].toFixed(meta.decimals + 1)} ${meta.unit}.`,
    `Mean of the last ${Math.min(24, n)} h: ${mean24.toFixed(meta.decimals + 1)} ${meta.unit}.`,
  ];
  if (slope6 !== null) {
    factors.push(
      `Recent slope (least squares, last ${Math.min(6, n)} h): ${slope6 >= 0 ? "+" : ""}${slope6.toFixed(2)} ${meta.unit}/h.`,
    );
  }
  if (seasonal) {
    factors.push("Enough history to learn a 24 h cycle, so a daily-pattern model was tested.");
  } else {
    factors.push("Fewer than 72 hours of contiguous data: daily-cycle models were not tested.");
  }
  if (usedTrimmed) factors.push("Only data after the most recent irrigation command was used (recession behaviour).");
  if (irrigationInWindow && !usedTrimmed) {
    factors.push("Irrigation commands occurred in the window; the forecast assumes none will occur.");
  }
  if (metric === "soil1" || metric === "soil2") {
    factors.push("Soil moisture forecast assumes no irrigation and no rain; either will invalidate it.");
  }

  return {
    metric,
    unit: meta.unit,
    label: meta.label,
    status: "ok",
    generatedAt: now,
    basedOnUntil: newestValid,
    lastObserved: y[n - 1],
    trainingHours: n,
    interpolatedHours,
    irrigationInWindow,
    points,
    path,
    selections,
    factors,
    history: y.map((v, i) => ({ t: (hourly.startBucket + run.endIndex - (n - 1) + i) * HOUR + HOUR / 2, v })),
  };
}

function trailingRun(h: Hourly): { y: number[]; interpolated: boolean[]; endIndex: number } | null {
  const end = h.values.length - 1;
  if (end < 0 || h.values[end] === null) return null;
  let start = end;
  while (start > 0 && h.values[start - 1] !== null) start--;
  return {
    y: h.values.slice(start, end + 1) as number[],
    interpolated: h.interpolated.slice(start, end + 1),
    endIndex: end,
  };
}
