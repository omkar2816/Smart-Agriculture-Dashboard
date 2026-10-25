import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, supabaseConfigStatus } from "@/lib/config";

/**
 * Server-side Supabase client bound to the CURRENT USER's session cookies.
 * It uses the publishable key, so Row Level Security still applies; the
 * service-role key is intentionally never loaded anywhere in this app.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const status = supabaseConfigStatus();
  if (!status.ok) throw new Error(status.message);
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookie writes are handled by the proxy instead.
        }
      },
    },
  });
}

/**
 * Returns an identifier for the request ("anonymous" in direct-access mode).
 */
export async function getRequestUserId(_supabase?: SupabaseClient): Promise<string | null> {
  return "anonymous";
}
