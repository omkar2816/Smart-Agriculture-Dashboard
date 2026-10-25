import { z } from "zod";

/**
 * Open-Meteo forecast client (https://open-meteo.com).
 * Free tier is for non-commercial use with a daily request limit; see README.
 * Open-Meteo does NOT supply official weather warnings, so `alerts` is always
 * empty and the UI says so instead of inventing any.
 */

export interface CurrentWeather {
  t: number;
  temperature: number | null;
  humidity: number | null;
  apparentTemperature: number | null;
  precipitation: number | null;
  weatherCode: number | null;
  windSpeedKmh: number | null;
  isDay: boolean | null;
}

export interface HourlyWeather {
  t: number;
  temperature: number | null;
  humidity: number | null;
  /** Provider-forecast probability of precipitation (%). NOT produced by this app. */
  precipitationProbability: number | null;
  /** Provider-forecast precipitation amount for the hour (mm). */
  precipitation: number | null;
  weatherCode: number | null;
}

export interface DailyWeather {
  t: number;
  weatherCode: number | null;
  temperatureMax: number | null;
  temperatureMin: number | null;
  precipitationSum: number | null;
  precipitationProbabilityMax: number | null;
  sunrise: number | null;
  sunset: number | null;
}

export interface WeatherForecast {
  provider: "Open-Meteo";
  fetchedAt: number;
  latitude: number;
  longitude: number;
  timezone: string;
  utcOffsetSeconds: number;
  elevation: number | null;
  current: CurrentWeather | null;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
  /** Always empty for Open-Meteo (no alert feed). */
  alerts: never[];
}

const num = z.number().nullable();
const numArr = z.array(num);

const responseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  utc_offset_seconds: z.number(),
  timezone: z.string(),
  elevation: z.number().nullish(),
  current: z
    .object({
      time: z.number(),
      temperature_2m: num.optional(),
      relative_humidity_2m: num.optional(),
      apparent_temperature: num.optional(),
      precipitation: num.optional(),
      weather_code: num.optional(),
      wind_speed_10m: num.optional(),
      is_day: num.optional(),
    })
    .optional(),
  hourly: z
    .object({
      time: z.array(z.number()),
      temperature_2m: numArr.optional(),
      relative_humidity_2m: numArr.optional(),
      precipitation_probability: numArr.optional(),
      precipitation: numArr.optional(),
      weather_code: numArr.optional(),
    })
    .optional(),
  daily: z
    .object({
      time: z.array(z.number()),
      weather_code: numArr.optional(),
      temperature_2m_max: numArr.optional(),
      temperature_2m_min: numArr.optional(),
      precipitation_sum: numArr.optional(),
      precipitation_probability_max: numArr.optional(),
      sunrise: numArr.optional(),
      sunset: numArr.optional(),
    })
    .optional(),
});

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

export function buildForecastUrl(lat: number, lon: number): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day",
    hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset",
    timezone: "auto",
    timeformat: "unixtime",
    forecast_days: "7",
    wind_speed_unit: "kmh",
  });
  return `${OPEN_METEO_URL}?${p.toString()}`;
}

/** Validate and normalise the provider response. Throws on a malformed payload. */
export function parseForecast(json: unknown, fetchedAt: number = Date.now()): WeatherForecast {
  const r = responseSchema.parse(json);
  const at = <T,>(arr: Array<T | null> | undefined, i: number): T | null => (arr ? (arr[i] ?? null) : null);
  const ms = (s: number | null) => (s === null ? null : s * 1000);

  const current: CurrentWeather | null = r.current
    ? {
        t: r.current.time * 1000,
        temperature: r.current.temperature_2m ?? null,
        humidity: r.current.relative_humidity_2m ?? null,
        apparentTemperature: r.current.apparent_temperature ?? null,
        precipitation: r.current.precipitation ?? null,
        weatherCode: r.current.weather_code ?? null,
        windSpeedKmh: r.current.wind_speed_10m ?? null,
        isDay: r.current.is_day == null ? null : r.current.is_day === 1,
      }
    : null;

  const hourly: HourlyWeather[] = (r.hourly?.time ?? []).map((t, i) => ({
    t: t * 1000,
    temperature: at(r.hourly?.temperature_2m, i),
    humidity: at(r.hourly?.relative_humidity_2m, i),
    precipitationProbability: at(r.hourly?.precipitation_probability, i),
    precipitation: at(r.hourly?.precipitation, i),
    weatherCode: at(r.hourly?.weather_code, i),
  }));

  const daily: DailyWeather[] = (r.daily?.time ?? []).map((t, i) => ({
    t: t * 1000,
    weatherCode: at(r.daily?.weather_code, i),
    temperatureMax: at(r.daily?.temperature_2m_max, i),
    temperatureMin: at(r.daily?.temperature_2m_min, i),
    precipitationSum: at(r.daily?.precipitation_sum, i),
    precipitationProbabilityMax: at(r.daily?.precipitation_probability_max, i),
    sunrise: ms(at(r.daily?.sunrise, i)),
    sunset: ms(at(r.daily?.sunset, i)),
  }));

  return {
    provider: "Open-Meteo",
    fetchedAt,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
    utcOffsetSeconds: r.utc_offset_seconds,
    elevation: r.elevation ?? null,
    current,
    hourly,
    daily,
    alerts: [],
  };
}

export interface RainOutlook {
  /** Hours covered (up to 24). */
  hours: number;
  /** Highest hourly precipitation probability (provider forecast); null if not supplied. */
  maxProbability: number | null;
  /** Sum of forecast precipitation (mm). */
  totalMm: number | null;
  /** Epoch ms of the first hour with >= 0.2 mm or >= 50% probability. */
  firstWetHour: number | null;
}

/** Summarise provider rain data for the next 24 h starting at `now`. Never invents values. */
export function rainOutlook(w: WeatherForecast, now: number = Date.now()): RainOutlook {
  const from = now - 3_600_000; // include the hour in progress
  const to = now + 24 * 3_600_000;
  const rows = w.hourly.filter((h) => h.t >= from && h.t < to);
  const probs = rows.map((h) => h.precipitationProbability).filter((v): v is number => v !== null);
  const amts = rows.map((h) => h.precipitation).filter((v): v is number => v !== null);
  const wet = rows.find(
    (h) => (h.precipitation ?? 0) >= 0.2 || (h.precipitationProbability ?? 0) >= 50,
  );
  return {
    hours: rows.length,
    maxProbability: probs.length ? Math.max(...probs) : null,
    totalMm: amts.length ? amts.reduce((s, v) => s + v, 0) : null,
    firstWetHour: wet ? wet.t : null,
  };
}

/** WMO weather interpretation codes -> short label (as documented by Open-Meteo). */
export function weatherCodeLabel(code: number | null): string {
  if (code === null) return "Unknown";
  const map: Record<number, string> = {
    0: "Clear sky",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Heavy freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Heavy freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers",
    81: "Showers",
    82: "Violent showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm with hail",
  };
  return map[code] ?? `Code ${code}`;
}

export function isWetCode(code: number | null): boolean {
  return code !== null && (code >= 51 && code <= 67 ? true : code >= 80 && code <= 99);
}
