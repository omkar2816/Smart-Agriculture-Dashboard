import { describe, expect, it } from "vitest";
import { forecastMetric } from "@/lib/forecast/engine";
import { computeForecasts } from "@/lib/ai/payload";
import type { Reading } from "@/lib/types";

describe("Forecasting Engine", () => {
  const HOUR = 3_600_000;
  const now = Date.parse("2026-10-25T12:00:00Z");

  it("returns insufficient status when no readings exist", () => {
    const res = forecastMetric([], "soil1", { now });
    expect(res.status).toBe("insufficient");
    expect(res.reason).toContain("No readings are stored yet");
  });

  it("returns insufficient status when the newest reading is stale (>3h)", () => {
    const staleReading: Reading = {
      t: now - 5 * HOUR,
      recordedAt: new Date(now - 5 * HOUR).toISOString(),
      deviceId: "esp32-01",
      soil1Raw: 2000,
      soil2Raw: 2000,
      soil1: 50,
      soil2: 50,
      temperature: 25,
      humidity: 60,
      pump: false,
      valve1: false,
      valve2: false,
      invalidFields: [],
    };
    const res = forecastMetric([staleReading], "soil1", { now });
    expect(res.status).toBe("insufficient");
    expect(res.reason).toContain("more than 3 hours old");
  });

  it("produces valid multi-horizon forecast when provided 48h of continuous data", () => {
    // Generate 48 hourly readings up to `now`
    const readings: Reading[] = [];
    const count = 48;
    for (let i = count - 1; i >= 0; i--) {
      const t = now - i * HOUR;
      // Diurnal variation for temperature and slow drydown for soil moisture
      const hourOfDay = new Date(t).getUTCHours();
      const temp = 25 + 5 * Math.sin((hourOfDay - 6) * (Math.PI / 12));
      const soil = 60 - (count - 1 - i) * 0.2; // slow dry-down

      readings.push({
        t,
        recordedAt: new Date(t).toISOString(),
        deviceId: "esp32-01",
        soil1Raw: 2000,
        soil2Raw: 2000,
        soil1: Number(soil.toFixed(1)),
        soil2: Number(soil.toFixed(1)),
        temperature: Number(temp.toFixed(1)),
        humidity: 65,
        pump: false,
        valve1: false,
        valve2: false,
        invalidFields: [],
      });
    }

    const res = forecastMetric(readings, "temperature", { now });
    expect(res.status).toBe("ok");
    expect(res.points.length).toBe(3); // 6, 12, 24 h
    expect(res.path.length).toBe(24); // 1..24 hours
    expect(res.selections.length).toBe(3); // 6, 12, 24 h

    // Check 6h forecast
    const h6 = res.points.find((p) => p.horizonHours === 6);
    expect(h6).toBeDefined();
    expect(h6?.value).toBeGreaterThan(15);
    expect(h6?.value).toBeLessThan(40);

    // Test computeForecasts
    const all = computeForecasts(readings, now);
    expect(all.soil1?.status).toBe("ok");
    expect(all.soil2?.status).toBe("ok");
    expect(all.temperature?.status).toBe("ok");
    expect(all.humidity?.status).toBe("ok");
  });
});
