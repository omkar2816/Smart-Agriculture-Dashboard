import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { WeatherError, fetchWeather } from "@/lib/weather/server";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

/** GET /api/weather?lat=..&lon=.. -> validated Open-Meteo forecast. */
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_coordinates", message: "Provide numeric lat (-90..90) and lon (-180..180)." },
      { status: 400 },
    );
  }
  try {
    const forecast = await fetchWeather(parsed.data.lat, parsed.data.lon);
    return NextResponse.json(forecast, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (e) {
    const status = e instanceof WeatherError ? e.status : 502;
    return NextResponse.json(
      { error: "weather_unavailable", message: e instanceof Error ? e.message : "Weather unavailable." },
      { status },
    );
  }
}
