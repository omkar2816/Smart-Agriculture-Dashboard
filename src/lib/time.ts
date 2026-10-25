import type { Freshness } from "@/lib/types";

/** Resolve the effective IANA zone: explicit setting, else the browser's, else UTC. */
export function resolveTimeZone(tz: string | undefined): string {
  if (tz) return tz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function getFreshness(
  latestT: number | null,
  now: number,
  staleAfterMinutes: number,
  offlineAfterMinutes: number,
): Freshness {
  if (latestT === null) return { state: "none", ageMs: null };
  const ageMs = now - latestT;
  // A reading timestamped in the future (> 2 min) means the device clock is wrong.
  if (ageMs < -2 * 60_000) return { state: "future", ageMs };
  if (ageMs <= staleAfterMinutes * 60_000) return { state: "fresh", ageMs };
  if (ageMs <= offlineAfterMinutes * 60_000) return { state: "stale", ageMs };
  return { state: "offline", ageMs };
}

export function formatDateTime(ms: number, tz: string, opts: { seconds?: boolean } = {}): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: opts.seconds ? "2-digit" : undefined,
    hour12: false,
  }).format(new Date(ms));
}

export function formatFullDateTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(new Date(ms));
}

export function formatTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
}

export function formatDay(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(ms));
}

/** Axis tick: time only for short ranges, date for long ranges. */
export function formatTick(ms: number, tz: string, spanMs: number): string {
  if (spanMs <= 36 * 3_600_000) return formatTime(ms, tz);
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" }).format(new Date(ms));
}

export function tzName(ms: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(ms));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}

export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const s = Math.round(abs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 48) return rem ? `${h} h ${rem} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

export function formatAge(ageMs: number | null): string {
  if (ageMs === null) return "never";
  if (ageMs < 45_000) return "just now";
  return `${formatDuration(ageMs)} ago`;
}

/** Local-time value for <input type="datetime-local"> in the given zone. */
export function toLocalInputValue(ms: number, tz: string): string {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
  return p.replace(" ", "T");
}

/** Inverse of toLocalInputValue: interpret a wall-clock string in `tz` and return epoch ms. */
export function fromLocalInputValue(value: string, tz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Iteratively correct by the zone offset at that instant.
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const shown = Date.parse(`${toLocalInputValue(guess, tz)}:00Z`);
    guess += asUtc - shown;
  }
  return Number.isFinite(guess) ? guess : null;
}
