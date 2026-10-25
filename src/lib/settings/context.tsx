"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  parseStoredSettings,
  type Settings,
} from "@/lib/settings/schema";
import { resolveTimeZone } from "@/lib/time";

interface SettingsContextValue {
  settings: Settings;
  /** False until localStorage has been read (avoids hydration mismatches). */
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  /** Effective IANA time zone. */
  tz: string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Reading localStorage is only possible after mount; this is the one-time hydration of external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(parseStoredSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY)));
    setReady(true);
  }, []);

  const persist = useCallback((next: Settings) => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable (private mode / quota): settings last for this session only */
    }
  }, []);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    persist(DEFAULT_SETTINGS);
  }, [persist]);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, ready, update, reset, tz: resolveTimeZone(settings.timezone) }),
    [settings, ready, update, reset],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
