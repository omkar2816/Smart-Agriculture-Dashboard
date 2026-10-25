"use client";

import { AlertTriangle, CheckCircle2, Info, Lightbulb } from "lucide-react";
import { TONE_CLASSES, type Tone } from "@/components/dashboard/tones";
import type { Insight } from "@/lib/insights";
import { cn } from "@/lib/utils";

const ICON = {
  action: AlertTriangle,
  watch: Lightbulb,
  info: Info,
  good: CheckCircle2,
} as const;

const LABEL: Record<Insight["severity"], string> = {
  action: "Needs attention",
  watch: "Keep an eye on",
  info: "For your information",
  good: "Looks good",
};

export function InsightList({ insights, empty }: { insights: Insight[]; empty?: string }) {
  if (!insights.length) {
    return <p className="rounded-lg border border-dashed border-[#d3cbb3] px-4 py-6 text-sm text-muted-foreground">{empty ?? "Nothing notable right now."}</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {insights.map((i) => {
        const Icon = ICON[i.severity];
        const tone = i.severity as Tone;
        return (
          <li key={i.id} className="flex gap-4 px-5 py-4">
            <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border", TONE_CLASSES[tone].chip)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-ink">
                {i.title} <span className="sr-only">({LABEL[i.severity]})</span>
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{i.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
