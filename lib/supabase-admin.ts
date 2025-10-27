import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { supabaseClient } from './core/supabase'

let cached: SupabaseClient | null = null

export function getSupabaseAdminClient(): SupabaseClient {
  if (cached) {
    return cached
  } 

  // supabaseClient is a singleton, but a new instance with session persistence disabled may be required in the Edge runtime.
  // Here, we create a new client by reusing the connection information of the existing client.
  cached = createClient(supabaseClient.supabaseUrl, supabaseClient.supabaseKey, {
    auth: {
      persistSession: false
    }
  })

  return cached
}
