import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ANALYSIS_JSON_SHAPE, analysisSchema, extractJson, ungroundedNumbers, type AiAnalysis } from "@/lib/ai/schema";
import { cacheGet, cacheSet, checkAndConsume, hashString, refund } from "@/lib/ai/guard";
import { AI_SYSTEM_PROMPT, buildAiPayload, buildUserPrompt } from "@/lib/ai/payload";
import { LlmError, generateJson, getAiConfig } from "@/lib/ai/provider";
import { isSupabaseConfigured } from "@/lib/config";
import { fetchRangeReadings, DataError } from "@/lib/data/queries";
import { DEFAULT_SETTINGS } from "@/lib/settings/schema";
import { getRequestUserId, getSupabaseServerClient } from "@/lib/supabase/server";
import { WeatherError, fetchWeather } from "@/lib/weather/server";
import type { WeatherForecast } from "@/lib/weather/openMeteo";

export const maxDuration = 60;

const safeName = (s: string) => s.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 40) || "Plant";

const bodySchema = z
  .object({
    force: z.boolean().default(false),
    deviceId: z.string().max(128).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    plant1Name: z.string().max(60).default("Plant 1"),
    plant2Name: z.string().max(60).default("Plant 2"),
    plant1DryBelow: z.number().min(0).max(100).default(DEFAULT_SETTINGS.plant1DryBelow),
    plant2DryBelow: z.number().min(0).max(100).default(DEFAULT_SETTINGS.plant2DryBelow),
    wetAbove: z.number().min(0).max(100).default(DEFAULT_SETTINGS.wetAbove),
  })
  .strict();

interface AnalysisResponse {
  analysis: AiAnalysis;
  warnings: string[];
  meta: {
    provider: string;
    model: string;
    generatedAt: number;
    dataUntil: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    weatherIncluded: boolean;
  };
}

/** GET: tells the UI whether AI is available. Never calls the provider and never reveals keys. */
export async function GET() {
  const cfg = getAiConfig();
  return NextResponse.json({
    enabled: cfg.provider !== "none",
    provider: cfg.provider,
    model: cfg.provider === "none" ? null : cfg.model,
    disabledReason: cfg.disabledReason,
    limits: {
      cacheTtlMinutes: Math.round(cfg.cacheTtlMs / 60000),
      perUserPerHour: cfg.rateLimitPerHour,
      perDay: cfg.maxRequestsPerDay,
      minIntervalSeconds: Math.round(cfg.minIntervalMs / 1000),
      maxOutputTokens: cfg.maxOutputTokens,
    },
  });
}

/**
 * POST: generate an explanation of the statistical forecasts.
 * The server recomputes every number itself from the database (under the
 * caller's own RLS-limited session), so the model can only explain data that
 * really exists, never data supplied by the browser.
 */
export async function POST(req: NextRequest) {
  const cfg = getAiConfig();
  if (cfg.provider === "none") {
    return NextResponse.json({ error: "ai_disabled", message: cfg.disabledReason }, { status: 503 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "not_configured", message: "Supabase is not configured." }, { status: 503 });
  }

  let json: unknown;
  try {
    const text = await req.text();
    if (text.length > 4000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    json = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", message: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = await getSupabaseServerClient();
  const userId = "anonymous";

  const hasLocation = typeof body.latitude === "number" && typeof body.longitude === "number";
  const cacheKey = hashString(
    JSON.stringify([
      cfg.provider,
      cfg.model,
      body.plant1DryBelow,
      body.plant2DryBelow,
      body.wetAbove,
      hasLocation ? [body.latitude!.toFixed(2), body.longitude!.toFixed(2)] : null,
    ]),
  );

  if (!body.force) {
    const hit = cacheGet<AnalysisResponse>(cacheKey);
    if (hit) return NextResponse.json({ ...hit, cached: true });
  }

  const decision = checkAndConsume(userId, {
    perHour: cfg.rateLimitPerHour,
    perDay: cfg.maxRequestsPerDay,
    minIntervalMs: cfg.minIntervalMs,
  });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: decision.reason, retryAfterSeconds: decision.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds ?? 60) } },
    );
  }

  try {
    const now = Date.now();
    const { readings } = await fetchRangeReadings(supabase, {
      fromMs: now - 7 * 24 * 3_600_000,
      toMs: now + 3_600_000,
      maxRows: 10_000,
    });
    if (!readings.length) {
      refund(userId);
      return NextResponse.json(
        { error: "insufficient_data", message: "No readings are stored in the database yet, so there is nothing to analyse." },
        { status: 422 },
      );
    }

    let weather: WeatherForecast | null = null;
    if (hasLocation) {
      try {
        weather = await fetchWeather(body.latitude as number, body.longitude as number);
      } catch (e) {
        if (!(e instanceof WeatherError)) throw e; // weather is optional; continue without it
      }
    }

    const payload = buildAiPayload({
      readings,
      weather,
      now,
      settings: {
        ...DEFAULT_SETTINGS,
        plant1Name: safeName(body.plant1Name),
        plant2Name: safeName(body.plant2Name),
        plant1DryBelow: body.plant1DryBelow,
        plant2DryBelow: body.plant2DryBelow,
        wetAbove: body.wetAbove,
      },
    });

    const anyForecast = Object.values(payload.forecasts).some((f) => f && f.status === "ok");
    if (!anyForecast && !payload.ruleBasedFindings.length) {
      refund(userId);
      return NextResponse.json(
        {
          error: "insufficient_data",
          message: "There is not yet enough history for forecasts, so no AI explanation was requested (this saves quota). Keep collecting readings.",
        },
        { status: 422 },
      );
    }

    const payloadJson = JSON.stringify(payload);
    let result;
    try {
      result = await generateJson(cfg, AI_SYSTEM_PROMPT, buildUserPrompt(payloadJson, ANALYSIS_JSON_SHAPE));
    } catch (e) {
      // One retry only for transient provider failures.
      if (e instanceof LlmError && e.retryable) {
        await new Promise((r) => setTimeout(r, 1200));
        result = await generateJson(cfg, AI_SYSTEM_PROMPT, buildUserPrompt(payloadJson, ANALYSIS_JSON_SHAPE));
      } else throw e;
    }

    let analysis: AiAnalysis;
    try {
      analysis = analysisSchema.parse(extractJson(result.text));
    } catch {
      refund(userId);
      return NextResponse.json(
        { error: "invalid_model_output", message: "The AI response did not match the expected format and was discarded." },
        { status: 502 },
      );
    }

    const warnings: string[] = [];
    const ungrounded = ungroundedNumbers(analysis, payloadJson);
    if (ungrounded.length) {
      warnings.push(
        `The AI text mentions number(s) that do not appear in the measured or forecast data (${ungrounded.slice(0, 5).join(", ")}). Treat them with caution; rely on the statistical forecasts shown above.`,
      );
    }

    const response: AnalysisResponse = {
      analysis,
      warnings,
      meta: {
        provider: cfg.provider,
        model: cfg.model,
        generatedAt: now,
        dataUntil: readings.at(-1)?.t ?? null,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        weatherIncluded: weather !== null,
      },
    };
    cacheSet(cacheKey, response, cfg.cacheTtlMs, now);
    return NextResponse.json({ ...response, cached: false });
  } catch (e) {
    if (e instanceof LlmError) {
      return NextResponse.json({ error: "ai_unavailable", message: e.message }, { status: e.status === 429 ? 429 : 502 });
    }
    if (e instanceof DataError) {
      refund(userId);
      return NextResponse.json({ error: "database_error", message: e.message }, { status: e.kind === "auth" ? 401 : 502 });
    }
    console.error("[ai/analyze] unexpected error", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "internal_error", message: "Unexpected error while generating the analysis." }, { status: 500 });
  }
}
