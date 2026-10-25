import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const querySchema = z.object({ q: z.string().trim().min(2).max(80) });

const resultSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        admin1: z.string().optional(),
        timezone: z.string().optional(),
      }),
    )
    .optional(),
});

/** GET /api/geocode?q=Pune -> Open-Meteo geocoding suggestions (to fill the farm location in Settings). */
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(parsed.data.q)}&count=5&language=en&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
    if (!res.ok) return NextResponse.json({ error: "geocoding_unavailable" }, { status: 502 });
    const json = resultSchema.parse(await res.json());
    return NextResponse.json({ results: json.results ?? [] });
  } catch {
    return NextResponse.json({ error: "geocoding_unavailable" }, { status: 502 });
  }
}
