import type { NumericMetric, Reading } from "@/lib/types";

/** Median spacing between consecutive readings, or null with < 2 readings. */
export function medianIntervalMs(readings: Reading[]): number | null {
  if (readings.length < 2) return null;
  const diffs: number[] = [];
  for (let i = 1; i < readings.length; i++) {
    const d = readings[i].t - readings[i - 1].t;
    if (d > 0) diffs.push(d);
  }
  if (!diffs.length) return null;
  diffs.sort((a, b) => a - b);
  const mid = Math.floor(diffs.length / 2);
  return diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
}

/**
 * Gap threshold above which two consecutive readings are NOT connected
 * (no interpolation across outages): 3x the median sampling interval,
 * but never less than `minMs`.
 */
export function gapThresholdMs(readings: Reading[], minMs = 10 * 60_000): number {
  const med = medianIntervalMs(readings);
  return Math.max(minMs, med ? med * 3 : 0);
}

export interface MetricStats {
  count: number;
  min: number | null;
  max: number | null;
  minAt: number | null;
  maxAt: number | null;
  /** Simple arithmetic mean of valid samples (biased if sampling is irregular). */
  mean: number | null;
  /**
   * Time-weighted mean (trapezoidal) over contiguous segments only. Robust to
   * irregular sampling; intervals longer than the gap threshold are excluded.
   */
  timeWeightedMean: number | null;
  first: number | null;
  last: number | null;
  firstAt: number | null;
  lastAt: number | null;
  /** last - first of valid samples. */
  change: number | null;
  /** Number of rows in the range where this metric is null / invalid. */
  missing: number;
}

export function computeStats(
  readings: Reading[],
  key: NumericMetric,
  gapMs: number = gapThresholdMs(readings),
): MetricStats {
  let count = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let minAt: number | null = null;
  let maxAt: number | null = null;
  let first: number | null = null;
  let last: number | null = null;
  let firstAt: number | null = null;
  let lastAt: number | null = null;
  let weighted = 0;
  let covered = 0;
  let prev: { t: number; v: number } | null = null;

  for (const r of readings) {
    const v = r[key];
    if (v === null) continue;
    count++;
    sum += v;
    if (v < min) {
      min = v;
      minAt = r.t;
    }
    if (v > max) {
      max = v;
      maxAt = r.t;
    }
    if (first === null) {
      first = v;
      firstAt = r.t;
    }
    last = v;
    lastAt = r.t;
    if (prev) {
      const dt = r.t - prev.t;
      if (dt > 0 && dt <= gapMs) {
        weighted += ((prev.v + v) / 2) * dt;
        covered += dt;
      }
    }
    prev = { t: r.t, v };
  }

  return {
    count,
    min: count ? min : null,
    max: count ? max : null,
    minAt,
    maxAt,
    mean: count ? sum / count : null,
    timeWeightedMean: covered > 0 ? weighted / covered : count ? sum / count : null,
    first,
    last,
    firstAt,
    lastAt,
    change: first !== null && last !== null && count > 1 ? last - first : null,
    missing: readings.length - count,
  };
}

/** Least-squares slope in units per hour over valid samples; null if < 3 samples or no time spread. */
export function slopePerHour(
  readings: Reading[],
  key: NumericMetric,
  windowMs?: number,
): { slope: number; n: number; r2: number } | null {
  const end = readings.length ? readings[readings.length - 1].t : 0;
  const pts: Array<[number, number]> = [];
  for (const r of readings) {
    const v = r[key];
    if (v === null) continue;
    if (windowMs && r.t < end - windowMs) continue;
    pts.push([r.t / 3_600_000, v]);
  }
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
    syy += (y - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, n, r2 };
}
