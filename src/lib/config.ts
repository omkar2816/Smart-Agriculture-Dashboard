/**
 * Public (browser-safe) configuration.
 *
 * IMPORTANT: Next.js only inlines `process.env.NEXT_PUBLIC_*` when it is
 * referenced statically, so each variable is read explicitly below.
 * Never put a Supabase secret / service-role key in any NEXT_PUBLIC_* variable.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const publicEnv = {
  supabaseUrl: url,
  supabaseKey: key,
  /** Direct dashboard access (no login required). */
  requireAuth: false,
} as const;

/** Decode a JWT payload without verifying (only used to detect an accidentally pasted privileged key). */
function jwtRole(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("utf8");
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

/** True for `sb_secret_...` keys and legacy JWTs whose role is `service_role`. */
export function looksLikeSecretKey(k: string): boolean {
  return k.startsWith("sb_secret_") || jwtRole(k) === "service_role";
}

export type SupabaseConfigStatus =
  | { ok: true }
  | { ok: false; reason: "missing" | "placeholder" | "secret-key" | "bad-url"; message: string };

export function supabaseConfigStatus(
  u: string = publicEnv.supabaseUrl,
  k: string = publicEnv.supabaseKey,
): SupabaseConfigStatus {
  if (!u || !k) {
    return {
      ok: false,
      reason: "missing",
      message:
        "Database connection credentials are not configured in your environment.",
    };
  }
  if (/your[-_]|placeholder|example/i.test(u) || /your[-_]|placeholder|example/i.test(k)) {
    return { ok: false, reason: "placeholder", message: "Database connection settings still contain placeholder values." };
  }
  if (!/^https?:\/\//.test(u)) {
    return { ok: false, reason: "bad-url", message: "Database connection URL must start with https://" };
  }
  if (looksLikeSecretKey(k)) {
    return {
      ok: false,
      reason: "secret-key",
      message:
        "A private secret key was detected. Only the public anon key should be provided.",
    };
  }
  return { ok: true };
}

export function isSupabaseConfigured(): boolean {
  return supabaseConfigStatus().ok;
}
