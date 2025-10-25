import { createClient, type SupabaseClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL) {
  throw new Error('Missing required environment variable "SUPABASE_URL"')
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing required environment variable "SUPABASE_SERVICE_ROLE_KEY"'
  )
}

export const supabaseClient: SupabaseClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)