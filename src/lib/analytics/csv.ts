import type { Reading } from "@/lib/types";

const HEADERS = [
  "recorded_at_utc",
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
] as const;

/**
 * Escape a CSV cell (RFC 4180) and neutralise spreadsheet formula injection:
 * text starting with = + - @ (that is not a plain number) is prefixed with a quote.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) {
    s = `'${s}`;
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function readingsToCsv(readings: Reading[]): string {
  const lines = [HEADERS.join(",")];
  for (const r of readings) {
    lines.push(
      [
        new Date(r.t).toISOString(),
        r.deviceId,
        r.soil1Raw,
        r.soil2Raw,
        r.soil1,
        r.soil2,
        r.temperature,
        r.humidity,
        r.pump,
        r.valve1,
        r.valve2,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

/** Trigger a browser download of CSV text (UTF-8 with BOM so Excel detects encoding). */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
