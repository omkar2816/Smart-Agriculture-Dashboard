import { describe, expect, it } from "vitest";
import { computeStats, medianIntervalMs, slopePerHour } from "@/lib/analytics/stats";
import type { Reading } from "@/lib/types";

function mockReading(tMinutes: number, soil1: number | null): Reading {
  return {
    t: tMinutes * 60_000,
    recordedAt: new Date(tMinutes * 60_000).toISOString(),
    deviceId: "esp32",
    soil1,
    soil2: null,
    soil1Raw: null,
    soil2Raw: null,
    temperature: null,
    humidity: null,
    pump: null,
    valve1: null,
    valve2: null,
    invalidFields: [],
  };
}

describe("Statistical Aggregations & Irregular Intervals", () => {
  it("computes median sampling interval correctly", () => {
    const readings: Reading[] = [
      mockReading(0, 40),
      mockReading(5, 41),
      mockReading(10, 42),
      mockReading(15, 43),
    ];

    expect(medianIntervalMs(readings)).toBe(5 * 60_000);
  });

  it("calculates min, max, change, and arithmetic mean", () => {
    const readings: Reading[] = [
      mockReading(0, 30),
      mockReading(10, 50),
      mockReading(20, 40),
    ];

    const stats = computeStats(readings, "soil1");
    expect(stats.count).toBe(3);
    expect(stats.min).toBe(30);
    expect(stats.max).toBe(50);
    expect(stats.mean).toBe(40);
    expect(stats.change).toBe(10); // 40 - 30
    expect(stats.missing).toBe(0);
  });

  it("handles null readings without skewing stats", () => {
    const readings: Reading[] = [
      mockReading(0, 30),
      mockReading(10, null),
      mockReading(20, 50),
    ];

    const stats = computeStats(readings, "soil1");
    expect(stats.count).toBe(2);
    expect(stats.missing).toBe(1);
    expect(stats.mean).toBe(40);
  });

  it("computes slope per hour accurately", () => {
    // Drops 2% moisture per hour over 3 hours
    const readings: Reading[] = [
      mockReading(0, 50),
      mockReading(60, 48),
      mockReading(120, 46),
      mockReading(180, 44),
    ];

    const result = slopePerHour(readings, "soil1");
    expect(result).not.toBeNull();
    expect(result?.slope).toBeCloseTo(-2.0, 1);
    expect(result?.r2).toBeCloseTo(1.0, 2);
  });
});
