import { z } from "zod";

/**
 * User-configurable dashboard settings. Stored in the browser (localStorage);
 * no extra database table is required. Contains no secrets.
 */
export const settingsSchema = z.object({
  farmName: z.string().trim().max(80).default("My farm"),
  /** Weather location. null until the user sets it — we never assume a location. */
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  /** IANA time zone, or "" to use the browser's. */
  timezone: z.string().max(64).default(""),
  /** device_id to display, or "" for the device with the newest reading. */
  deviceId: z.string().max(128).default(""),
  plant1Name: z.string().trim().max(40).default("Plant 1"),
  plant2Name: z.string().trim().max(40).default("Plant 2"),
  /** Moisture (%) below which a plant is considered to need water. */
  plant1DryBelow: z.number().min(0).max(100).default(35),
  plant2DryBelow: z.number().min(0).max(100).default(35),
  /** Moisture (%) above which soil is considered saturated. */
  wetAbove: z.number().min(0).max(100).default(80),
  /** Age of newest reading after which data is flagged stale. */
  staleAfterMinutes: z.number().min(1).max(1440).default(60),
  /** Age after which the device is considered not reporting. */
  offlineAfterMinutes: z.number().min(2).max(10080).default(180),
  refreshSeconds: z.number().min(10).max(600).default(30),
  aiEnabled: z.boolean().default(true),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export const SETTINGS_STORAGE_KEY = "smart-agri.settings.v1";

/** Parse untrusted stored JSON, falling back to defaults field by field. */
export function parseStoredSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
      if (!(key in json)) continue;
      const single = settingsSchema.shape[key].safeParse(json[key]);
      if (single.success) merged[key] = single.data;
    }
    const full = settingsSchema.safeParse(merged);
    return full.success ? full.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return true;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
