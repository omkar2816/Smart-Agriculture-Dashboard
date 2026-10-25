import { z } from "zod";

/** Structure the LLM must return. It contains NO numeric forecast fields on purpose. */
export const analysisSchema = z.object({
  summary: z.string().trim().min(1).max(700),
  insights: z
    .array(
      z.object({
        severity: z.enum(["info", "watch", "action"]),
        title: z.string().trim().min(1).max(100),
        detail: z.string().trim().min(1).max(500),
        relatedMetric: z.enum(["soil1", "soil2", "temperature", "humidity", "weather", "system"]),
      }),
    )
    .max(6),
  irrigation: z
    .array(
      z.object({
        plant: z.union([z.literal(1), z.literal(2)]),
        advice: z.string().trim().min(1).max(400),
      }),
    )
    .max(2),
  caveats: z.array(z.string().trim().min(1).max(240)).max(4),
});

export type AiAnalysis = z.infer<typeof analysisSchema>;

/** JSON Schema variant for providers that accept a response schema. */
export const ANALYSIS_JSON_SHAPE = `{
  "summary": string,                       // 1-3 sentences
  "insights": [ { "severity": "info"|"watch"|"action", "title": string, "detail": string,
                  "relatedMetric": "soil1"|"soil2"|"temperature"|"humidity"|"weather"|"system" } ],   // max 6
  "irrigation": [ { "plant": 1|2, "advice": string } ],   // max 2, advisory only
  "caveats": [ string ]                    // max 4
}`;

/** Extract a JSON object from model text (tolerates ```json fences). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model did not return a JSON object.");
  return JSON.parse(body.slice(start, end + 1));
}

function numbersIn(text: string): number[] {
  return (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
}

/**
 * Light "grounding" check: every number mentioned in the narrative should
 * appear (within rounding) in the data the model was given. Small integers
 * (counts, hours, plant numbers) are allowed. Returns offending numbers; the
 * UI shows a warning instead of silently trusting the text.
 */
export function ungroundedNumbers(analysis: AiAnalysis, inputJson: string): number[] {
  const allowed = numbersIn(inputJson);
  const texts = [
    analysis.summary,
    ...analysis.insights.flatMap((i) => [i.title, i.detail]),
    ...analysis.irrigation.map((i) => i.advice),
    ...analysis.caveats,
  ];
  const bad = new Set<number>();
  for (const t of texts) {
    for (const n of numbersIn(t)) {
      if (Number.isInteger(n) && Math.abs(n) <= 24) continue;
      if ([30, 48, 72, 100, 168].includes(n)) continue;
      const ok = allowed.some((a) => Math.abs(a - n) <= Math.max(0.1, Math.abs(a) * 0.01));
      if (!ok) bad.add(n);
    }
  }
  return [...bad];
}
