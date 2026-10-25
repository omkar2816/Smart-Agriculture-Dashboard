import "server-only";

export type AiProviderId = "none" | "gemini" | "openai";

export interface AiConfig {
  provider: AiProviderId;
  model: string;
  apiKey: string;
  maxOutputTokens: number;
  cacheTtlMs: number;
  rateLimitPerHour: number;
  maxRequestsPerDay: number;
  minIntervalMs: number;
  /** Why AI is unavailable, when provider === "none". */
  disabledReason: string | null;
}

const DEFAULT_MODELS: Record<Exclude<AiProviderId, "none">, string> = {
  // Model names change over time and free-tier eligibility differs per model.
  // Set AI_MODEL explicitly after checking the provider's current model list and limits.
  gemini: "gemini-flash-lite-latest",
  openai: "gpt-4o-mini",
};

function int(name: string, fallback: number, min: number, max: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= min && v <= max ? Math.floor(v) : fallback;
}

/** Reads server-only environment variables. Keys never leave the server. */
export function getAiConfig(): AiConfig {
  const base = {
    maxOutputTokens: int("AI_MAX_OUTPUT_TOKENS", 1200, 200, 4000),
    cacheTtlMs: int("AI_CACHE_TTL_MINUTES", 180, 1, 1440) * 60_000,
    rateLimitPerHour: int("AI_RATE_LIMIT_PER_HOUR", 6, 1, 120),
    maxRequestsPerDay: int("AI_MAX_REQUESTS_PER_DAY", 40, 1, 2000),
    minIntervalMs: int("AI_MIN_INTERVAL_SECONDS", 120, 0, 3600) * 1000,
  };
  const raw = (process.env.AI_PROVIDER ?? "none").trim().toLowerCase();
  if (raw === "none" || raw === "") {
    return { ...base, provider: "none", model: "", apiKey: "", disabledReason: "AI_PROVIDER is not set (AI explanations are disabled)." };
  }
  if (raw !== "gemini" && raw !== "openai") {
    return { ...base, provider: "none", model: "", apiKey: "", disabledReason: `Unsupported AI_PROVIDER "${raw}". Use gemini, openai or none.` };
  }
  const apiKey = (raw === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY)?.trim() ?? "";
  if (!apiKey || /your[-_]|placeholder/i.test(apiKey)) {
    return {
      ...base,
      provider: "none",
      model: "",
      apiKey: "",
      disabledReason: `${raw === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} is not set.`,
    };
  }
  return {
    ...base,
    provider: raw,
    apiKey,
    model: process.env.AI_MODEL?.trim() || DEFAULT_MODELS[raw],
    disabledReason: null,
  };
}

export interface LlmResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export class LlmError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status = 502, retryable = false) {
    super(message);
    this.name = "LlmError";
    this.status = status;
    this.retryable = retryable;
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch {
    throw new LlmError("The AI provider could not be reached (network error or timeout).", 504, true);
  }
  if (!res.ok) {
    // Do not echo provider bodies verbatim: they can include request details.
    if (res.status === 429) throw new LlmError("The AI provider rate limit or quota was reached. Try again later.", 429);
    if (res.status === 401 || res.status === 403) throw new LlmError("The AI provider rejected the API key or the model is not available to it.", 502);
    throw new LlmError(`The AI provider returned HTTP ${res.status}.`, 502, res.status >= 500);
  }
  return res.json();
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function generateJson(cfg: AiConfig, system: string, user: string): Promise<LlmResult> {
  if (cfg.provider === "gemini") {
    const data = (await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
      { "x-goog-api-key": cfg.apiKey },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: cfg.maxOutputTokens,
          responseMimeType: "application/json",
        },
      },
    )) as GeminiResponse;
    const cand = data.candidates?.[0];
    const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new LlmError("The AI provider returned an empty response (it may have been blocked).");
    if (cand?.finishReason === "MAX_TOKENS") throw new LlmError("The AI response was cut off by the token limit. Increase AI_MAX_OUTPUT_TOKENS.");
    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
    };
  }
  if (cfg.provider === "openai") {
    const data = (await postJson(
      "https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${cfg.apiKey}` },
      {
        model: cfg.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_completion_tokens: cfg.maxOutputTokens,
        response_format: { type: "json_object" },
      },
    )) as OpenAiResponse;
    const choice = data.choices?.[0];
    const text = choice?.message?.content ?? "";
    if (!text) throw new LlmError("The AI provider returned an empty response.");
    if (choice?.finish_reason === "length") throw new LlmError("The AI response was cut off by the token limit. Increase AI_MAX_OUTPUT_TOKENS.");
    return {
      text,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
    };
  }
  throw new LlmError("AI is disabled.", 503);
}
