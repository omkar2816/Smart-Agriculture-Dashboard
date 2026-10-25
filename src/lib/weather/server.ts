import "server-only";
import { buildForecastUrl, parseForecast, type WeatherForecast } from "@/lib/weather/openMeteo";

export class WeatherError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "WeatherError";
    this.status = status;
  }
}

/** Fetch + validate an Open-Meteo forecast (server-side, cached by Next for 10 minutes, one retry). */
export async function fetchWeather(lat: number, lon: number): Promise<WeatherForecast> {
  const url = buildForecastUrl(lat, lon);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 600 },
      });
      if (res.status === 429) throw new WeatherError("Open-Meteo rate limit reached. Try again later.", 429);
      if (!res.ok) throw new WeatherError(`Open-Meteo responded with HTTP ${res.status}.`);
      return parseForecast(await res.json(), Date.now());
    } catch (e) {
      lastErr = e;
      if (e instanceof WeatherError && e.status === 429) break;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  if (lastErr instanceof WeatherError) throw lastErr;
  throw new WeatherError("The weather service is unreachable or returned an unexpected response.");
}
