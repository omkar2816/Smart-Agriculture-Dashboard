"use client";

import { useMemo } from "react";
import { useLatestReading, useNow, useRecentReadings } from "@/lib/data/hooks";
import { useSettings } from "@/lib/settings/context";
import { getFreshness } from "@/lib/time";
import type { Freshness, Reading } from "@/lib/types";

export interface DashboardData {
  /** Newest reading in the database for the active device (may be old). */
  latest: Reading | null;
  /** Last 24 h of readings, ascending. */
  recent: Reading[];
  freshness: Freshness;
  now: number;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  /** True once a query has completed with no rows at all. */
  isEmpty: boolean;
  lastFetchedAt: number | null;
  refetch: () => void;
}

/** One hook that combines the "latest row" and "last 24 h" queries for the pages that show live data. */
export function useDashboardData(): DashboardData {
  const { settings } = useSettings();
  const latestQ = useLatestReading();
  const recentQ = useRecentReadings();
  const now = useNow(15_000);

  const recent = useMemo(() => recentQ.data ?? [], [recentQ.data]);
  const latest = latestQ.data ?? recent[recent.length - 1] ?? null;
  const freshness =
    now > 0
      ? getFreshness(latest?.t ?? null, now, settings.staleAfterMinutes, settings.offlineAfterMinutes)
      : ({ state: "none", ageMs: null } as const);
  const isLoading = (latestQ.isLoading || recentQ.isLoading) && !latest;
  const error = latestQ.error ?? recentQ.error ?? null;
  const settled = latestQ.isSuccess && recentQ.isSuccess;
  const lastFetchedAt = Math.max(latestQ.dataUpdatedAt || 0, recentQ.dataUpdatedAt || 0) || null;

  return {
    latest,
    recent,
    freshness,
    now,
    isLoading,
    isFetching: latestQ.isFetching || recentQ.isFetching,
    error: latest ? null : error, // keep showing last known data; surface errors via `staleError`
    isEmpty: settled && !latest,
    lastFetchedAt,
    refetch: () => {
      void latestQ.refetch();
      void recentQ.refetch();
    },
  };
}

/** Error present while older data is still displayed (e.g. network dropped mid-session). */
export function useBackgroundError(): unknown {
  const latestQ = useLatestReading();
  const recentQ = useRecentReadings();
  return latestQ.data ? (latestQ.error ?? recentQ.error ?? null) : null;
}
