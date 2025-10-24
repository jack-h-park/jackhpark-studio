import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function getSupabaseAdminClient(): SupabaseClient {
  if (cached) {
    return cached
  }

  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables for admin dashboard'
    )
  }

  cached = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  })

  return cached
}
