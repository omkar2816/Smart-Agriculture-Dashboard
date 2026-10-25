import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, supabaseConfigStatus } from "@/lib/config";

let client: SupabaseClient | null = null;

/** Browser Supabase client (publishable/anon key only; access is governed by RLS). */
export function getSupabaseBrowserClient(): SupabaseClient {
  const status = supabaseConfigStatus();
  if (!status.ok) throw new Error(status.message);
  if (!client) client = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseKey);
  return client;
}
