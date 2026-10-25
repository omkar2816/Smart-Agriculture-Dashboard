import type { NumericMetric, Reading } from "@/lib/types";

export type ChartPoint = { t: number } & Partial<Record<NumericMetric, number | null>>;

/**
 * Convert readings into chart points.
 *
 * - Down-samples by averaging inside equal time buckets when there are more
 *   than `maxPoints` readings (keeps charts responsive for 30-day ranges).
 * - Inserts an all-null point inside any gap longer than `gapMs`, so the
 *   chart line is BROKEN across outages instead of drawing a misleading
 *   interpolated line.
 * - Null / invalid values stay null (never zero-filled).
 */
export function buildChartSeries(
  readings: Reading[],
  keys: NumericMetric[],
  opts: { maxPoints?: number; gapMs: number },
): ChartPoint[] {
  const maxPoints = opts.maxPoints ?? 400;
  if (!readings.length) return [];

  let points: ChartPoint[];
  if (readings.length <= maxPoints) {
    points = readings.map((r) => {
      const p: ChartPoint = { t: r.t };
      for (const k of keys) p[k] = r[k];
      return p;
    });
  } else {
    const t0 = readings[0].t;
    const t1 = readings[readings.length - 1].t;
    const bucketMs = Math.max(1, Math.ceil((t1 - t0 + 1) / maxPoints));
    const buckets = new Map<number, { sum: Record<string, number>; n: Record<string, number>; tSum: number; c: number }>();
    for (const r of readings) {
      const b = Math.floor((r.t - t0) / bucketMs);
      let acc = buckets.get(b);
      if (!acc) {
        acc = { sum: {}, n: {}, tSum: 0, c: 0 };
        buckets.set(b, acc);
      }
      acc.tSum += r.t;
      acc.c++;
      for (const k of keys) {
        const v = r[k];
        if (v === null) continue;
        acc.sum[k] = (acc.sum[k] ?? 0) + v;
        acc.n[k] = (acc.n[k] ?? 0) + 1;
      }
    }
    points = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, acc]) => {
        const p: ChartPoint = { t: Math.round(acc.tSum / acc.c) };
        for (const k of keys) p[k] = acc.n[k] ? acc.sum[k] / acc.n[k] : null;
        return p;
      });
  }

  // Break the line across gaps.
  const effectiveGap = Math.max(opts.gapMs, 1);
  const out: ChartPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && points[i].t - points[i - 1].t > effectiveGap) {
      const gapPoint: ChartPoint = { t: points[i - 1].t + 1 };
      for (const k of keys) gapPoint[k] = null;
      out.push(gapPoint);
    }
    out.push(points[i]);
  }
  return out;
}
