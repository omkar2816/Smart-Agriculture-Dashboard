import { describe, expect, it } from "vitest";
import {
  buildForecastUrl,
  isWetCode,
  parseForecast,
  rainOutlook,
  weatherCodeLabel,
} from "@/lib/weather/openMeteo";

describe("Open-Meteo Integration", () => {
  it("builds a correctly formatted query URL", () => {
    const url = buildForecastUrl(15.4989, 73.8278);
    expect(url).toContain("https://api.open-meteo.com/v1/forecast?");
    expect(url).toContain("latitude=15.499");
    expect(url).toContain("longitude=73.828");
    expect(url).toContain("timezone=auto");
    expect(url).toContain("timeformat=unixtime");
  });

  it("parses valid Open-Meteo response into WeatherForecast structure", () => {
    const mockJson = {
      latitude: 15.5,
      longitude: 73.8,
      utc_offset_seconds: 19800,
      timezone: "Asia/Kolkata",
      elevation: 32,
      current: {
        time: 1700000000,
        temperature_2m: 28.5,
        relative_humidity_2m: 65,
        apparent_temperature: 31.0,
        precipitation: 0.0,
        weather_code: 1,
        wind_speed_10m: 12.4,
        is_day: 1,
      },
      hourly: {
        time: [1700000000, 1700003600, 1700007200],
        temperature_2m: [28.5, 27.8, 26.9],
        relative_humidity_2m: [65, 70, 75],
        precipitation_probability: [10, 20, 60],
        precipitation: [0.0, 0.0, 1.5],
        weather_code: [1, 2, 61],
      },
      daily: {
        time: [1700000000],
        weather_code: [1],
        temperature_2m_max: [31.5],
        temperature_2m_min: [22.0],
        precipitation_sum: [1.5],
        precipitation_probability_max: [60],
        sunrise: [1700010000],
        sunset: [1700050000],
      },
    };

    const parsed = parseForecast(mockJson);
    expect(parsed.provider).toBe("Open-Meteo");
    expect(parsed.latitude).toBe(15.5);
    expect(parsed.current?.temperature).toBe(28.5);
    expect(parsed.current?.isDay).toBe(true);
    expect(parsed.hourly.length).toBe(3);
    expect(parsed.daily.length).toBe(1);
    expect(parsed.alerts).toEqual([]);
  });

  it("maps WMO weather codes and wet conditions", () => {
    expect(weatherCodeLabel(0)).toBe("Clear sky");
    expect(weatherCodeLabel(61)).toBe("Light rain");
    expect(weatherCodeLabel(95)).toBe("Thunderstorm");
    expect(weatherCodeLabel(null)).toBe("Unknown");

    expect(isWetCode(0)).toBe(false);
    expect(isWetCode(61)).toBe(true); // Light rain
    expect(isWetCode(95)).toBe(true); // Thunderstorm
    expect(isWetCode(null)).toBe(false);
  });

  it("computes rain outlook correctly across upcoming 24 hours", () => {
    const baseSec = 1700000000;
    const mockForecast = parseForecast({
      latitude: 15.5,
      longitude: 73.8,
      utc_offset_seconds: 0,
      timezone: "UTC",
      hourly: {
        time: [baseSec, baseSec + 3600, baseSec + 7200],
        precipitation_probability: [10, 20, 70],
        precipitation: [0.0, 0.1, 2.5],
      },
    });

    const outlook = rainOutlook(mockForecast, baseSec * 1000);
    expect(outlook.hours).toBe(3);
    expect(outlook.maxProbability).toBe(70);
    expect(outlook.totalMm).toBeCloseTo(2.6);
    expect(outlook.firstWetHour).toBe((baseSec + 7200) * 1000);
  });
});
