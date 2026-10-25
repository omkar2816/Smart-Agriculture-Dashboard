"use client";

import { AlertTriangle, CircleSlash, Inbox, RefreshCw, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TONE_CLASSES, type Tone } from "@/components/dashboard/tones";
import { DataError } from "@/lib/data/queries";
import { cn } from "@/lib/utils";

export function LoadingBlock({ className, lines = 3, label = "Loading" }: { className?: string; lines?: number; label?: string }) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-5 bg-[#e9e2d0]" style={{ width: `${92 - i * 14}%` }} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div role="status" aria-label="Loading chart" className="relative overflow-hidden rounded-lg bg-[#efe9da]" style={{ height }}>
      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <svg className="absolute inset-x-4 bottom-8 h-1/2 w-[calc(100%-2rem)] text-[#d9d1bb]" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
        <path d="M0 22 C 10 10, 20 24, 30 14 S 50 6, 60 16 S 80 26, 100 8" fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-xl border border-dashed border-[#d3cbb3] bg-[#fbf8f0] px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-[#ece6d6] text-[#5b6558]">
        {icon ?? <Inbox className="size-5" aria-hidden />}
      </div>
      <h3 className="text-lg font-medium text-ink">{title}</h3>
      {children && <div className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
  title,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  title?: string;
}) {
  const kind = error instanceof DataError ? error.kind : "unknown";
  const message = error instanceof Error ? error.message : "Something went wrong while loading data.";
  const Icon = kind === "network" ? WifiOff : kind === "permission" || kind === "auth" ? CircleSlash : AlertTriangle;
  return (
    <div role="alert" className={cn("rounded-xl border p-5", TONE_CLASSES.action.chip, "bg-[#f8e9e0]", className)}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title ?? (kind === "network" ? "Can’t reach the database" : "Couldn’t load data")}</p>
          <p className="mt-1 text-sm leading-relaxed opacity-90">{message}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3 border-current bg-transparent" onClick={onRetry}>
              <RefreshCw className="size-3.5" aria-hidden /> Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  icon,
  className,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <div className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed", t.chip, className)} role={tone === "action" ? "alert" : "note"}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>
      </div>
    </div>
  );
}
