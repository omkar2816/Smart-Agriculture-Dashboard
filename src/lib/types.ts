/**
 * Shared domain types.
 *
 * `RawSensorRow` mirrors the *known* columns of `public.sensor_readings`.
 * Everything is treated as possibly null / possibly stringly-typed because the
 * actual column types have not been verified for every deployment (e.g. a
 * `numeric` column is returned as a string by PostgREST in some configurations).
 * Run `npm run check:db` or the schema check in Settings to verify your table.
 */

export const SENSOR_TABLE = "sensor_readings" as const;

export const SENSOR_COLUMNS = [
  "device_id",
  "soil_1_raw",
  "soil_2_raw",
  "soil_1_moisture",
  "soil_2_moisture",
  "temperature_c",
  "humidity_percent",
  "pump_on",
  "valve_1_on",
  "valve_2_on",
  "recorded_at",
] as const;

export type SensorColumn = (typeof SENSOR_COLUMNS)[number];

/** Row exactly as it may arrive from PostgREST. */
export type RawSensorRow = Partial<Record<SensorColumn, unknown>>;

/** A validated, normalised reading. `null` means "missing or invalid". */
export interface Reading {
  /** Epoch milliseconds (UTC) of `recorded_at`. */
  t: number;
  /** Original ISO string. */
  recordedAt: string;
  deviceId: string | null;
  soil1Raw: number | null;
  soil2Raw: number | null;
  soil1: number | null;
  soil2: number | null;
  temperature: number | null;
  humidity: number | null;
  pump: boolean | null;
  valve1: boolean | null;
  valve2: boolean | null;
  /** Field names whose stored value was present but physically implausible. */
  invalidFields: string[];
}

export type NumericMetric =
  | "soil1"
  | "soil2"
  | "temperature"
  | "humidity"
  | "soil1Raw"
  | "soil2Raw";

export interface MetricMeta {
  key: NumericMetric;
  label: string;
  unit: string;
  decimals: number;
  /** Inclusive plausible physical range; values outside are treated as invalid. */
  min: number;
  max: number;
}

export type FreshnessState = "fresh" | "stale" | "offline" | "none" | "future";

export interface Freshness {
  state: FreshnessState;
  ageMs: number | null;
}
