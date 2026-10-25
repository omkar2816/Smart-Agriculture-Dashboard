import { describe, expect, it } from "vitest";
import {
  fitPersistence,
  fitDampedHolt,
  fitSeasonalLevel,
  backtest,
} from "@/lib/forecast/models";

describe("Forecasting Models & Backtesting", () => {
  it("fits persistence baseline carrying forward last observation", () => {
    const y = [20, 21, 22, 23, 24];
    const model = fitPersistence(y);
    expect(model.id).toBe("persistence");
    expect(model.forecastAt(y.length - 1, 1)).toBe(24);
    expect(model.forecastAt(y.length - 1, 12)).toBe(24);
  });

  it("fits damped-trend exponential smoothing for trending series", () => {
    // Upward trend with noise
    const y = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32];
    const model = fitDampedHolt(y);
    expect(model).not.toBeNull();
    if (model) {
      expect(model.id).toBe("damped-holt");
      const f1 = model.forecastAt(y.length - 1, 1);
      const f6 = model.forecastAt(y.length - 1, 6);
      expect(f1).toBeGreaterThan(32);
      expect(f6).toBeGreaterThan(f1);
    }
  });

  it("returns null when fitting models with insufficient data length", () => {
    const shortY = [10, 11, 12];
    expect(fitDampedHolt(shortY)).toBeNull();
    expect(fitSeasonalLevel(shortY, 24)).toBeNull();
  });

  it("backtests candidate models and produces empirical MAE and RMSE errors", () => {
    const y = Array.from({ length: 48 }, (_, i) => 20 + Math.sin((i / 24) * 2 * Math.PI) * 5);
    const pers = fitPersistence(y);
    const errors = backtest(y, pers, 10);

    expect(errors[1]).not.toBeNull();
    expect(errors[6]).not.toBeNull();
    expect(errors[1]?.n).toBeGreaterThan(0);
    expect(errors[1]?.mae).toBeGreaterThanOrEqual(0);
  });
});
