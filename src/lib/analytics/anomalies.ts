import { stateIntervals } from "@/lib/analytics/irrigation";
import type { NumericMetric, Reading } from "@/lib/types";

export type AnomalyKind = "out_of_range" | "spike" | "flatline" | "dropout";

export interface Anomaly {
  kind: AnomalyKind;
  metric: string;
  /** Time of the (latest) occurrence. */
  t: number;
  message: string;
  severity: "info" | "watch";
}

const SPIKE_MIN_JUMP: Partial<Record<NumericMetric, number>> = {
  temperature: 5, // °C between consecutive readings
  humidity: 20, // % RH
  soil1: 15, // % moisture
  soil2: 15,
};

const FIELD_LABEL: Record<string, string> = {
  soil_1_raw: "Plant 1 raw soil value",
  soil_2_raw: "Plant 2 raw soil value",
  soil_1_moisture: "Plant 1 soil moisture",
  soil_2_moisture: "Plant 2 soil moisture",
  temperature_c: "Temperature",
  humidity_percent: "Humidity",
};

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Transparent, rule-based anomaly detection on sensor values.
 * Nothing here is learned or guessed; each rule is documented in the message.
 */
export function detectAnomalies(readings: Reading[], gapMs: number): Anomaly[] {
  const out: Anomaly[] = [];
  if (readings.length < 2) return out;

  // 1. Out-of-range values (stored but physically implausible)
  const oor = new Map<string, { n: number; t: number }>();
  for (const r of readings) {
    for (const f of r.invalidFields) {
      const e = oor.get(f);
      oor.set(f, { n: (e?.n ?? 0) + 1, t: Math.max(e?.t ?? 0, r.t) });
    }
  }
  for (const [f, e] of oor) {
    out.push({
      kind: "out_of_range",
      metric: f,
      t: e.t,
      severity: "watch",
      message: `${FIELD_LABEL[f] ?? f} was outside its plausible range in ${e.n} reading${e.n > 1 ? "s" : ""}; those values were ignored. Check wiring or calibration.`,
    });
  }

  // 2. Sudden jumps between consecutive readings
  const pumpWindows = stateIntervals(readings, "pump", gapMs);
  const nearIrrigation = (t: number) =>
    pumpWindows.some((w) => t >= w.start - gapMs && t <= (w.end ?? w.lastOn) + 35 * 60_000);
  for (const key of Object.keys(SPIKE_MIN_JUMP) as NumericMetric[]) {
    const minJump = SPIKE_MIN_JUMP[key] as number;
    const diffs: Array<{ d: number; t: number }> = [];
    let prev: Reading | null = null;
    for (const r of readings) {
      const v = r[key];
      if (v === null) continue;
      if (prev && r.t - prev.t <= gapMs) diffs.push({ d: (v as number) - (prev[key] as number), t: r.t });
      prev = r;
    }
    if (diffs.length < 10) continue;
    const med = median(diffs.map((x) => x.d));
    const mad = median(diffs.map((x) => Math.abs(x.d - med))) || 0.01;
    const hits = diffs.filter(
      (x) =>
        Math.abs(x.d) >= minJump &&
        Math.abs(x.d - med) > 6 * 1.4826 * mad &&
        !((key === "soil1" || key === "soil2") && nearIrrigation(x.t)),
    );
    if (hits.length) {
      const last = hits[hits.length - 1];
      out.push({
        kind: "spike",
        metric: key,
        t: last.t,
        severity: "watch",
        message: `${key === "temperature" ? "Temperature" : key === "humidity" ? "Humidity" : key === "soil1" ? "Plant 1 soil moisture" : "Plant 2 soil moisture"} jumped by ${last.d >= 0 ? "+" : ""}${last.d.toFixed(1)} between two consecutive readings (${hits.length} such jump${hits.length > 1 ? "s" : ""} in range), far outside its normal variation${key.startsWith("soil") ? " and not near a pump command" : ""}.`,
      });
    }
  }

  // 3. Sensor dropout: recent readings all null while earlier ones were valid
  const recent = readings.slice(-6);
  const earlier = readings.slice(0, -6);
  for (const key of ["soil1", "soil2", "temperature", "humidity"] as NumericMetric[]) {
    if (recent.length === 6 && recent.every((r) => r[key] === null) && earlier.filter((r) => r[key] !== null).length >= 10) {
      out.push({
        kind: "dropout",
        metric: key,
        t: recent[recent.length - 1].t,
        severity: "watch",
        message: `${key === "temperature" ? "Temperature" : key === "humidity" ? "Humidity" : key === "soil1" ? "Plant 1 soil" : "Plant 2 soil"} has had no valid value in the last 6 readings although earlier readings were valid. The sensor may be disconnected or failing.`,
      });
    }
  }

  // 4. Flat-lined raw soil signal (identical ADC value for many hours)
  for (const key of ["soil1Raw", "soil2Raw"] as NumericMetric[]) {
    const vals = readings.filter((r) => r[key] !== null);
    if (vals.length < 12) continue;
    const spanMs = vals[vals.length - 1].t - vals[0].t;
    if (spanMs < 6 * 3_600_000) continue;
    const first = vals[0][key];
    if (vals.every((r) => r[key] === first)) {
      out.push({
        kind: "flatline",
        metric: key,
        t: vals[vals.length - 1].t,
        severity: "info",
        message: `${key === "soil1Raw" ? "Plant 1" : "Plant 2"} raw soil value has been identical (${first}) for ${(spanMs / 3_600_000).toFixed(0)} h. This can mean a stuck or disconnected sensor, or soil that really has not changed.`,
      });
    }
  }

  return out.sort((a, b) => b.t - a.t).slice(0, 20);
}
