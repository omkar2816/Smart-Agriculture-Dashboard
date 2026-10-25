import { describe, expect, it } from "vitest";
import { normalizeRow, normalizeRows, parseTimestamp, toBool, toNumber } from "@/lib/data/normalize";
import type { RawSensorRow } from "@/lib/types";

describe("Row Normalization & Validation", () => {
  it("coerces numeric values and strings correctly", () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber("28.5")).toBe(28.5);
    expect(toNumber("")).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber("invalid")).toBeNull();
  });

  it("coerces boolean values across representations", () => {
    expect(toBool(true)).toBe(true);
    expect(toBool(false)).toBe(false);
    expect(toBool(1)).toBe(true);
    expect(toBool(0)).toBe(false);
    expect(toBool("true")).toBe(true);
    expect(toBool("t")).toBe(true);
    expect(toBool("ON")).toBe(true);
    expect(toBool("f")).toBe(false);
    expect(toBool(null)).toBeNull();
  });

  it("parses timestamps with and without timezone offset", () => {
    const withZ = parseTimestamp("2026-10-25T12:00:00Z");
    expect(withZ).toBe(Date.parse("2026-10-25T12:00:00Z"));

    const noZ = parseTimestamp("2026-10-25T12:00:00");
    expect(noZ).toBe(Date.parse("2026-10-25T12:00:00Z"));

    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp(null)).toBeNull();
  });

  it("normalizes a valid raw row into a Reading domain object", () => {
    const raw: RawSensorRow = {
      device_id: "esp32-greenhouse-01",
      recorded_at: "2026-10-25T14:30:00Z",
      soil_1_moisture: "45",
      soil_2_moisture: 60,
      temperature_c: 24.8,
      humidity_percent: "65",
      pump_on: 1,
      valve_1_on: "true",
      valve_2_on: 0,
      soil_1_raw: 2150,
      soil_2_raw: 1800,
    };

    const reading = normalizeRow(raw);
    expect(reading).not.toBeNull();
    expect(reading?.soil1).toBe(45);
    expect(reading?.soil2).toBe(60);
    expect(reading?.temperature).toBe(24.8);
    expect(reading?.humidity).toBe(65);
    expect(reading?.pump).toBe(true);
    expect(reading?.valve1).toBe(true);
    expect(reading?.valve2).toBe(false);
    expect(reading?.invalidFields).toHaveLength(0);
  });

  it("flags physically implausible values without crashing", () => {
    const raw: RawSensorRow = {
      recorded_at: "2026-10-25T14:30:00Z",
      soil_1_moisture: 150, // Impossible: > 100%
      temperature_c: -99, // Impossible: < -40°C
    };

    const reading = normalizeRow(raw);
    expect(reading).not.toBeNull();
    expect(reading?.soil1).toBeNull();
    expect(reading?.temperature).toBeNull();
    expect(reading?.invalidFields).toContain("soil_1_moisture");
    expect(reading?.invalidFields).toContain("temperature_c");
  });

  it("drops rows without timestamps and deduplicates (device, time)", () => {
    const rows: RawSensorRow[] = [
      { recorded_at: null, soil_1_moisture: 40 },
      { device_id: "dev-1", recorded_at: "2026-10-25T10:00:00Z", soil_1_moisture: 40 },
      { device_id: "dev-1", recorded_at: "2026-10-25T10:00:00Z", soil_1_moisture: 40 }, // duplicate
      { device_id: "dev-1", recorded_at: "2026-10-25T09:00:00Z", soil_1_moisture: 42 },
    ];

    const normalized = normalizeRows(rows);
    expect(normalized).toHaveLength(2);
    // Should be sorted ascending by time:
    expect(normalized[0].recordedAt).toBe("2026-10-25T09:00:00Z");
    expect(normalized[1].recordedAt).toBe("2026-10-25T10:00:00Z");
  });

  it("normalizes user's actual database telemetry rows seamlessly", () => {
    const userRows: RawSensorRow[] = [
      {"device_id":"esp32_agriculture","recorded_at":"2026-10-25 17:10:25.328328+00","soil_1_raw":4095,"soil_2_raw":4095,"soil_1_moisture":"0","soil_2_moisture":"0","temperature_c":"31.4","humidity_percent":"64.6","pump_on":true,"valve_1_on":true,"valve_2_on":true},
      {"device_id":"esp32_agriculture","recorded_at":"2026-10-25 17:10:55.144891+00","soil_1_raw":4095,"soil_2_raw":4095,"soil_1_moisture":"0","soil_2_moisture":"0","temperature_c":"31.4","humidity_percent":"64.8","pump_on":true,"valve_1_on":true,"valve_2_on":true},
      {"device_id":"esp32_agriculture","recorded_at":"2026-10-25 17:11:25.10711+00","soil_1_raw":4095,"soil_2_raw":4095,"soil_1_moisture":"0","soil_2_moisture":"0","temperature_c":"31.4","humidity_percent":"64.7","pump_on":false,"valve_1_on":false,"valve_2_on":false},
      {"device_id":"esp32_agriculture","recorded_at":"2026-10-25 17:11:55.114146+00","soil_1_raw":4095,"soil_2_raw":4095,"soil_1_moisture":"0","soil_2_moisture":"0","temperature_c":"31.4","humidity_percent":"64.6","pump_on":true,"valve_1_on":true,"valve_2_on":true},
      {"device_id":"esp32_agriculture","recorded_at":"2026-10-25 17:12:25.835021+00","soil_1_raw":4095,"soil_2_raw":4095,"soil_1_moisture":"0","soil_2_moisture":"0","temperature_c":"31.4","humidity_percent":"64.6","pump_on":true,"valve_1_on":true,"valve_2_on":true}
    ];

    const normalized = normalizeRows(userRows);
    expect(normalized).toHaveLength(5);
    const latest = normalized[4];
    expect(latest.soil1).toBe(0);
    expect(latest.soil2).toBe(0);
    expect(latest.soil1Raw).toBe(4095);
    expect(latest.soil2Raw).toBe(4095);
    expect(latest.temperature).toBe(31.4);
    expect(latest.humidity).toBe(64.6);
    expect(latest.pump).toBe(true);
    expect(latest.valve1).toBe(true);
    expect(latest.valve2).toBe(true);
    expect(latest.deviceId).toBe("esp32_agriculture");
  });
});

