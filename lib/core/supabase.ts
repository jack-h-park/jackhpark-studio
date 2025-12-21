import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client bootstrap (lazy).
 *
 * IMPORTANT:
 * - This module must be safe to import in unit tests.
 * - Do NOT read or validate environment variables at module load time.
 * - Environment variables are validated only when the client is actually used.
 */

let _client: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable "${name}"`);
  }
  return value;
}

/**
 * Lazily creates and returns the Supabase client.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY (server-only usage).
 */
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  _client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return _client;
}

/**
 * Backward-compatible export.
 *
 * Existing call sites can continue using:
 *   supabaseClient.from(...)
 *
 * The actual client is instantiated on first property access.
 */
export const supabaseClient: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseClient() as any)[prop as any];
  },
});
