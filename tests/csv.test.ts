import { describe, expect, it } from "vitest";
import { csvCell, readingsToCsv } from "@/lib/analytics/csv";
import type { Reading } from "@/lib/types";

describe("CSV Export & Security Sanitization", () => {
  it("escapes special characters (commas, newlines, quotes) per RFC 4180", () => {
    expect(csvCell("clean_value")).toBe("clean_value");
    expect(csvCell("value,with,comma")).toBe('"value,with,comma"');
    expect(csvCell('value "with" quotes')).toBe('"value ""with"" quotes"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes spreadsheet formula injection (=, +, -, @)", () => {
    expect(csvCell("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
    expect(csvCell("+1234cmd")).toBe("'+1234cmd");
    expect(csvCell("@import")).toBe("'@import");
    // But plain negative numbers remain valid numbers:
    expect(csvCell(-15.5)).toBe("-15.5");
  });

  it("formats readings array into compliant CSV text", () => {
    const readings: Reading[] = [
      {
        t: Date.parse("2026-10-25T12:00:00Z"),
        recordedAt: "2026-10-25T12:00:00Z",
        deviceId: "esp32-01",
        soil1Raw: 2100,
        soil2Raw: 1950,
        soil1: 45,
        soil2: 55,
        temperature: 26.2,
        humidity: 60,
        pump: false,
        valve1: false,
        valve2: true,
        invalidFields: [],
      },
    ];

    const csv = readingsToCsv(readings);
    expect(csv).toContain("recorded_at_utc,device_id,soil_1_raw,soil_2_raw");
    expect(csv).toContain("2026-10-25T12:00:00.000Z,esp32-01,2100,1950,45,55,26.2,60,false,false,true");
  });
});
