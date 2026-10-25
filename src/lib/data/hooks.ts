"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DataError,
  fetchDeviceIds,
  fetchLatestReadings,
  fetchRangeReadings,
  fetchReadingsAfter,
} from "@/lib/data/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/config";
import { useSettings } from "@/lib/settings/context";
import type { Reading } from "@/lib/types";

const HOUR = 3_600_000;
export const RECENT_WINDOW_MS = 24 * HOUR;
const RECENT_MAX_ROWS = 4000;

/** Retry transient failures with backoff, but never retry config / permission / schema errors. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof DataError && ["schema", "permission", "auth"].includes(error.kind)) return false;
  if (error instanceof DOMException && error.name === "AbortError") return false;
  return failureCount < 3;
}

export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    // Initial value can only be read client-side.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function useDeviceIds() {
  const { settings } = useSettings();
  const configured = isSupabaseConfigured();
  return useQuery({
    queryKey: ["devices"],
    enabled: configured,
    queryFn: () => fetchDeviceIds(getSupabaseBrowserClient()),
    retry: shouldRetry,
    refetchInterval: Math.max(settings.refreshSeconds, 60) * 1000,
    staleTime: 30_000,
  });
}

/**
 * Direct device state: always ready, queries read all database rows directly.
 */
export function useActiveDevice(): { deviceId: string | null; ready: boolean; devices: string[] } {
  return { deviceId: null, ready: true, devices: [] };
}

/** Single newest reading directly from the database. */
export function useLatestReading() {
  const { settings } = useSettings();
  const configured = isSupabaseConfigured();
  return useQuery({
    queryKey: ["latest"],
    enabled: configured,
    refetchInterval: settings.refreshSeconds * 1000,
    retry: shouldRetry,
    queryFn: async () => {
      const rows = await fetchLatestReadings(getSupabaseBrowserClient(), { limit: 1 });
      return rows[0] ?? null;
    },
  });
}

/**
 * Last 24 h of readings directly from the database, kept fresh with cheap incremental queries.
 */
export function useRecentReadings() {
  const qc = useQueryClient();
  const { settings } = useSettings();
  const configured = isSupabaseConfigured();
  const key = useMemo(() => ["recent"], []);

  return useQuery({
    queryKey: key,
    enabled: configured,
    refetchInterval: settings.refreshSeconds * 1000,
    retry: shouldRetry,
    queryFn: async (): Promise<Reading[]> => {
      const supabase = getSupabaseBrowserClient();
      const now = Date.now();
      const cutoff = now - RECENT_WINDOW_MS;
      const prev = qc.getQueryData<Reading[]>(key);
      if (prev && prev.length) {
        const newer = await fetchReadingsAfter(supabase, { afterIso: prev[prev.length - 1].recordedAt });
        const known = new Set(prev.map((r) => r.t));
        const merged = prev.concat(newer.filter((r) => !known.has(r.t))).filter((r) => r.t >= cutoff);
        return merged.length > RECENT_MAX_ROWS ? merged.slice(-RECENT_MAX_ROWS) : merged;
      }
      const { readings } = await fetchRangeReadings(supabase, {
        fromMs: cutoff,
        toMs: now + HOUR, // tolerate small device clock skew
        maxRows: RECENT_MAX_ROWS,
      });
      return readings;
    },
  });
}

export interface RangeSpec {
  fromMs: number;
  toMs: number;
}

/** Historical range query directly from the database. */
export function useRangeReadings(range: RangeSpec | null, enabled = true) {
  const configured = isSupabaseConfigured();
  return useQuery({
    queryKey: ["range", range?.fromMs, range?.toMs],
    enabled: enabled && range !== null && configured,
    retry: shouldRetry,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      fetchRangeReadings(getSupabaseBrowserClient(), {
        fromMs: (range as RangeSpec).fromMs,
        toMs: (range as RangeSpec).toMs,
        signal,
      }),
  });
}
