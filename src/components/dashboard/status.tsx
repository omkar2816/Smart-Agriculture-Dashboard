"use client";

import { Activity, CircleHelp, Power } from "lucide-react";
import { TONE_CLASSES, type Tone } from "@/components/dashboard/tones";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAge } from "@/lib/time";
import type { Freshness } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Chip({ tone = "neutral", children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", TONE_CLASSES[tone].chip, className)}
    >
      {children}
    </span>
  );
}

const FRESH_COPY: Record<Freshness["state"], { tone: Tone; label: string; hint: string }> = {
  fresh: {
    tone: "good",
    label: "Reporting",
    hint: "The newest database row is recent. This is inferred from timestamps, not a live link to the ESP32.",
  },
  stale: {
    tone: "watch",
    label: "Delayed",
    hint: "The newest row is older than your stale threshold. The device may be between uploads, rebooting or offline.",
  },
  offline: {
    tone: "action",
    label: "No recent data",
    hint: "No row has arrived within your offline threshold. The device, its Wi-Fi or the upload may have failed.",
  },
  none: { tone: "neutral", label: "No data yet", hint: "No readings are stored yet." },
  future: {
    tone: "watch",
    label: "Clock ahead",
    hint: "The newest reading is timestamped in the future; the ESP32 clock (NTP) is probably wrong.",
  },
};

/** Connectivity, inferred from the age of the newest stored reading. */
export function FreshnessPill({ freshness, className }: { freshness: Freshness; className?: string }) {
  const c = FRESH_COPY[freshness.state];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex cursor-help items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", TONE_CLASSES[c.tone].chip, className)}>
          <span className={cn("size-1.5 rounded-full", TONE_CLASSES[c.tone].dot, freshness.state === "fresh" && "animate-breathe")} aria-hidden />
          {c.label}
          {freshness.ageMs !== null && freshness.state !== "future" && <span className="font-normal opacity-80">· {formatAge(freshness.ageMs)}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent>{c.hint}</TooltipContent>
    </Tooltip>
  );
}

/** ON/OFF/unknown for relay COMMAND states (not proof of flow). */
export function RelayState({ value, label, className }: { value: boolean | null; label?: string; className?: string }) {
  const tone: Tone = value === true ? "good" : value === false ? "neutral" : "watch";
  const text = value === true ? "ON" : value === false ? "OFF" : "Unknown";
  const Icon = value === null ? CircleHelp : value ? Activity : Power;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold tracking-wide", TONE_CLASSES[tone].chip, className)}>
      <Icon className="size-3" aria-hidden />
      {label && <span className="font-medium opacity-80">{label}</span>}
      {text}
    </span>
  );
}
