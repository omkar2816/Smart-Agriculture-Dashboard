import type { MetricMeta, NumericMetric, RawSensorRow, Reading } from "@/lib/types";

export const METRICS: Record<NumericMetric, MetricMeta> = {
  soil1: { key: "soil1", label: "Soil moisture", unit: "%", decimals: 0, min: 0, max: 100 },
  soil2: { key: "soil2", label: "Soil moisture", unit: "%", decimals: 0, min: 0, max: 100 },
  temperature: { key: "temperature", label: "Temperature", unit: "°C", decimals: 1, min: -40, max: 80 },
  humidity: { key: "humidity", label: "Humidity", unit: "%", decimals: 0, min: 0, max: 100 },
  // Wide permissive range: ESP32 ADC is 12-bit (0–4095) but external ADCs go higher.
  soil1Raw: { key: "soil1Raw", label: "Soil raw", unit: "", decimals: 0, min: 0, max: 65535 },
  soil2Raw: { key: "soil2Raw", label: "Soil raw", unit: "", decimals: 0, min: 0, max: 65535 },
};

/** Coerce a PostgREST value (number | numeric-string | null) to a finite number or null. */
export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Coerce boolean-ish values. Supports true/false, 1/0, "t"/"f", "true"/"false". */
export function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["t", "true", "1", "on", "yes"].includes(s)) return true;
    if (["f", "false", "0", "off", "no"].includes(s)) return false;
  }
  return null;
}

/**
 * Parse a Postgres timestamp. `timestamptz` values carry an offset and parse
 * exactly. If the column is `timestamp` (no zone) PostgREST returns a string
 * without an offset; we then assume UTC (what an ESP32 using NTP + Supabase
 * `now()` stores). Documented in the README.
 */
export function parseTimestamp(v: unknown): number | null {
  if (typeof v !== "string" || !v) return null;
  const hasZone = /([zZ]|[+-]\d{2}(:?\d{2})?)$/.test(v.trim());
  const iso = hasZone ? v : `${v.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function bounded(
  value: unknown,
  meta: MetricMeta,
  field: string,
  invalid: string[],
): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  if (n < meta.min || n > meta.max) {
    invalid.push(field);
    return null;
  }
  return n;
}

/**
 * Normalise one database row. Returns null if the row has no usable timestamp
 * (such a row cannot be placed on a time axis and is dropped, never guessed).
 */
export function normalizeRow(row: RawSensorRow): Reading | null {
  const t = parseTimestamp(row.recorded_at);
  if (t === null) return null;
  const invalid: string[] = [];
  return {
    t,
    recordedAt: String(row.recorded_at),
    deviceId: typeof row.device_id === "string" ? row.device_id : row.device_id == null ? null : String(row.device_id),
    soil1Raw: bounded(row.soil_1_raw, METRICS.soil1Raw, "soil_1_raw", invalid),
    soil2Raw: bounded(row.soil_2_raw, METRICS.soil2Raw, "soil_2_raw", invalid),
    soil1: bounded(row.soil_1_moisture, METRICS.soil1, "soil_1_moisture", invalid),
    soil2: bounded(row.soil_2_moisture, METRICS.soil2, "soil_2_moisture", invalid),
    temperature: bounded(row.temperature_c, METRICS.temperature, "temperature_c", invalid),
    humidity: bounded(row.humidity_percent, METRICS.humidity, "humidity_percent", invalid),
    pump: toBool(row.pump_on),
    valve1: toBool(row.valve_1_on),
    valve2: toBool(row.valve_2_on),
    invalidFields: invalid,
  };
}

/** Normalise, drop unusable rows, sort ascending by time and de-duplicate identical (device, time). */
export function normalizeRows(rows: RawSensorRow[]): Reading[] {
  const out: Reading[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const n = normalizeRow(r);
    if (!n) continue;
    const key = `${n.deviceId ?? ""}|${n.t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** Latest non-null value of a metric (searching backwards), with its timestamp. */
export function latestValue(
  readings: Reading[],
  key: NumericMetric,
): { value: number; t: number } | null {
  for (let i = readings.length - 1; i >= 0; i--) {
    const v = readings[i][key];
    if (v !== null) return { value: v, t: readings[i].t };
  }
  return null;
}
