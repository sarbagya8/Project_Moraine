import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;
let clientKey: string | undefined;

export function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) throw new Error("DATABASE_NOT_CONFIGURED");

  const cacheKey = `${url}:${key.slice(-8)}`;
  if (!client || clientKey !== cacheKey) {
    client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { "X-Client-Info": "argus-server" },
      },
    });
    clientKey = cacheKey;
  }

  return client;
}
