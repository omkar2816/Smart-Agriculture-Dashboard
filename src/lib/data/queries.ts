import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { normalizeRows } from "@/lib/data/normalize";
import { SENSOR_COLUMNS, SENSOR_TABLE, type RawSensorRow, type Reading } from "@/lib/types";

const SELECT = SENSOR_COLUMNS.join(",");
export const PAGE_SIZE = 1000;
/** Hard cap on rows loaded for one analytics range (protects the browser and the free-tier egress). */
export const MAX_RANGE_ROWS = 20_000;

export type DataErrorKind = "schema" | "permission" | "auth" | "network" | "unknown";

export class DataError extends Error {
  kind: DataErrorKind;
  code?: string;
  constructor(kind: DataErrorKind, message: string, code?: string) {
    super(message);
    this.name = "DataError";
    this.kind = kind;
    this.code = code;
  }
}

export function toDataError(err: PostgrestError | { message: string; code?: string }): DataError {
  const code = "code" in err ? err.code : undefined;
  const msg = err.message ?? "Unknown database error";
  if (code === "42703" || /column .* does not exist/i.test(msg)) {
    return new DataError("schema", `The table "${SENSOR_TABLE}" is missing an expected column: ${msg}. Run the schema check in Settings.`, code);
  }
  if (code === "42P01" || code === "PGRST205" || /relation .* does not exist|could not find the table/i.test(msg)) {
    return new DataError("schema", `The table "public.${SENSOR_TABLE}" was not found in this Supabase project.`, code);
  }
  if (code === "42501" || /permission denied/i.test(msg)) {
    return new DataError("permission", "Permission denied by the database. Check Row Level Security policies and grants (see supabase/policies.sql).", code);
  }
  if (code === "PGRST301" || /jwt/i.test(msg)) {
    return new DataError("auth", "Your session has expired. Please sign in again.", code);
  }
  if (/failed to fetch|network|fetch failed|timeout/i.test(msg)) {
    return new DataError("network", "Could not reach Supabase. Check your internet connection.", code);
  }
  return new DataError("unknown", msg, code);
}

interface Filters {
  deviceId?: string | null;
}

/** Newest readings first from the DB, returned ascending by time. */
export async function fetchLatestReadings(
  supabase: SupabaseClient,
  opts?: { limit?: number; deviceId?: string | null },
): Promise<Reading[]> {
  const q = supabase.from(SENSOR_TABLE).select(SELECT).order("recorded_at", { ascending: false }).limit(opts?.limit ?? 1);
  const { data, error } = await q;
  if (error) throw toDataError(error);
  return normalizeRows((data ?? []) as unknown as RawSensorRow[]);
}

/** Readings strictly newer than `afterIso`, ascending. Used for cheap incremental polling. */
export async function fetchReadingsAfter(
  supabase: SupabaseClient,
  opts: { afterIso: string; limit?: number; deviceId?: string | null },
): Promise<Reading[]> {
  const q = supabase
    .from(SENSOR_TABLE)
    .select(SELECT)
    .gt("recorded_at", opts.afterIso)
    .order("recorded_at", { ascending: true })
    .limit(opts.limit ?? PAGE_SIZE);
  const { data, error } = await q;
  if (error) throw toDataError(error);
  return normalizeRows((data ?? []) as unknown as RawSensorRow[]);
}

export interface RangeResult {
  readings: Reading[];
  /** True if the range holds more rows than `maxRows`; the OLDEST rows were not loaded. */
  truncated: boolean;
}

/**
 * Load a time range using keyset pagination on `recorded_at` (index friendly,
 * unlike OFFSET). Pages are fetched newest-first so that, when the cap is hit,
 * the most recent data is the data we keep.
 */
export async function fetchRangeReadings(
  supabase: SupabaseClient,
  opts: { fromMs: number; toMs: number; maxRows?: number; signal?: AbortSignal; deviceId?: string | null },
): Promise<RangeResult> {
  const maxRows = opts.maxRows ?? MAX_RANGE_ROWS;
  const fromIso = new Date(opts.fromMs).toISOString();
  let cursorIso = new Date(opts.toMs).toISOString();
  const rows: Reading[] = [];
  const seen = new Set<string>();
  let truncated = false;

  for (;;) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let q = supabase
      .from(SENSOR_TABLE)
      .select(SELECT)
      .gte("recorded_at", fromIso)
      .lte("recorded_at", cursorIso)
      .order("recorded_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (opts.signal) q = q.abortSignal(opts.signal);
    const { data, error } = await q;
    if (error) throw toDataError(error);
    const raw = (data ?? []) as unknown as RawSensorRow[];
    if (!raw.length) break;

    let added = 0;
    for (const r of normalizeRows(raw)) {
      const k = `${r.t}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push(r);
      added++;
    }
    if (raw.length < PAGE_SIZE || added === 0) break;
    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
    const oldest = raw[raw.length - 1].recorded_at;
    if (typeof oldest !== "string") break;
    cursorIso = oldest; // lte + de-duplication handles rows sharing a timestamp
  }

  rows.sort((a, b) => a.t - b.t);
  return { readings: truncated ? rows.slice(rows.length - maxRows) : rows, truncated };
}

/** Distinct device ids among the most recent rows, newest first. */
export async function fetchDeviceIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from(SENSOR_TABLE)
    .select("device_id,recorded_at")
    .order("recorded_at", { ascending: false })
    .limit(500);
  if (error) throw toDataError(error);
  const ids: string[] = [];
  for (const row of (data ?? []) as Array<{ device_id: unknown }>) {
    if (row.device_id == null) continue;
    const id = String(row.device_id);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export interface SchemaCheckResult {
  ok: boolean;
  /** Human readable findings. */
  messages: string[];
  rowVisible: boolean | null;
}

/**
 * Verifies that every expected column can be selected. A missing column makes
 * PostgREST fail with SQLSTATE 42703, which is reported precisely. Column TYPES
 * cannot be read through the API; use supabase/inspect_schema.sql for that.
 */
export async function checkSchema(supabase: SupabaseClient): Promise<SchemaCheckResult> {
  const { data, error } = await supabase.from(SENSOR_TABLE).select(SELECT).limit(1);
  if (error) {
    const e = toDataError(error);
    return { ok: false, messages: [e.message], rowVisible: null };
  }
  const visible = (data?.length ?? 0) > 0;
  return {
    ok: true,
    rowVisible: visible,
    messages: [
      `All ${SENSOR_COLUMNS.length} expected columns are selectable on public.${SENSOR_TABLE}.`,
      visible
        ? "At least one row is visible to the current session."
        : "No rows are visible: either the table is empty or Row Level Security hides rows from this session (see supabase/policies.sql).",
    ],
  };
}
