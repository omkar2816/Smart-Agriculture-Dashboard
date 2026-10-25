"use client";

import type { ReactNode } from "react";
import { TONE_CLASSES, type Tone } from "@/components/dashboard/tones";
import { formatAge } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Horizontal 0–100 rail with a threshold tick. Colour reflects position relative to configured thresholds. */
export function MoistureMeter({
  value,
  dryBelow,
  wetAbove,
  className,
}: {
  value: number | null;
  dryBelow: number;
  wetAbove: number;
  className?: string;
}) {
  const tone: Tone = value === null ? "neutral" : value < dryBelow ? "action" : value > wetAbove ? "info" : "good";
  return (
    <div className={cn("w-full", className)}>
      <div
        className="relative h-2.5 overflow-visible rounded-full bg-[#e7e0cd]"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-label="Soil moisture"
      >
        {value !== null && (
          <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", TONE_CLASSES[tone].bar)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        )}
        <span className="absolute -top-1 bottom-[-4px] w-px bg-[#24302a]/55" style={{ left: `${dryBelow}%` }} aria-hidden />
      </div>
      <div className="relative mt-1.5 h-4 text-[0.68rem] text-muted-foreground">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.min(88, Math.max(12, dryBelow))}%` }}>
          dry below {dryBelow}%
        </span>
        <span className="absolute right-0">100</span>
      </div>
    </div>
  );
}

export function MetricBlock({
  label,
  value,
  unit,
  decimals = 0,
  sub,
  ageMs,
  tone = "neutral",
  className,
  children,
}: {
  label: string;
  value: number | null;
  unit?: string;
  decimals?: number;
  sub?: ReactNode;
  /** Age of THIS value, shown if it is not from the newest row. */
  ageMs?: number | null;
  tone?: Tone;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="eyebrow">{label}</p>
      <p className={cn("display-num mt-2 text-[3.1rem] font-normal leading-none", value === null ? "text-[#b7b19c]" : tone === "action" ? "text-[#8a3b1c]" : "text-ink")}>
        {value === null ? "—" : value.toFixed(decimals)}
        {value !== null && unit && <span className="ml-1 text-xl text-muted-foreground">{unit}</span>}
      </p>
      <p className="mt-2 min-h-5 text-xs text-muted-foreground">
        {value === null ? "No valid reading" : ageMs && ageMs > 0 ? `Last valid value · ${formatAge(ageMs)}` : sub}
      </p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
