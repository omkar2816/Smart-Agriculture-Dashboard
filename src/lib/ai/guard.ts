import "server-only";

/**
 * In-memory guards for the AI route: per-user hourly limit, global daily cap,
 * minimum spacing between calls and a TTL result cache.
 *
 * LIMITATION: state lives in the server process. On serverless hosts (Vercel)
 * each warm instance has its own counters and cold starts reset them, so these
 * are best-effort cost brakes, not hard quotas. Set a hard budget/quota in the
 * AI provider console as the real backstop (see README).
 */
interface GuardState {
  perUser: Map<string, number[]>;
  day: { key: string; count: number };
  lastCallAt: Map<string, number>;
  cache: Map<string, { expires: number; value: unknown }>;
}

const g = globalThis as unknown as { __agriAiGuard?: GuardState };
const state: GuardState = (g.__agriAiGuard ??= {
  perUser: new Map(),
  day: { key: "", count: 0 },
  lastCallAt: new Map(),
  cache: new Map(),
});

export interface LimitDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: string;
}

export function checkAndConsume(
  userId: string,
  limits: { perHour: number; perDay: number; minIntervalMs: number },
  now = Date.now(),
): LimitDecision {
  const dayKey = new Date(now).toISOString().slice(0, 10);
  if (state.day.key !== dayKey) state.day = { key: dayKey, count: 0 };
  if (state.day.count >= limits.perDay) {
    return { allowed: false, retryAfterSeconds: 3600, reason: "The daily AI request budget for this deployment has been used." };
  }
  const last = state.lastCallAt.get(userId);
  if (last && now - last < limits.minIntervalMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((limits.minIntervalMs - (now - last)) / 1000),
      reason: "Please wait before requesting another analysis.",
    };
  }
  const recent = (state.perUser.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= limits.perHour) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((3_600_000 - (now - recent[0])) / 1000),
      reason: "Hourly AI request limit reached.",
    };
  }
  recent.push(now);
  state.perUser.set(userId, recent);
  state.lastCallAt.set(userId, now);
  state.day.count++;
  return { allowed: true };
}

/** Give back a consumed slot when the provider call failed before producing a result. */
export function refund(userId: string) {
  const arr = state.perUser.get(userId);
  if (arr?.length) arr.pop();
  if (state.day.count > 0) state.day.count--;
  state.lastCallAt.delete(userId);
}

export function cacheGet<T>(key: string, now = Date.now()): T | null {
  const hit = state.cache.get(key);
  if (!hit) return null;
  if (hit.expires < now) {
    state.cache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number, now = Date.now()) {
  if (state.cache.size >= 50) {
    const oldest = state.cache.keys().next().value;
    if (oldest !== undefined) state.cache.delete(oldest);
  }
  state.cache.set(key, { expires: now + ttlMs, value });
}

/** Small non-cryptographic hash for cache keys (FNV-1a). */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
