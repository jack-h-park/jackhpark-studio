import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { supabaseClient } from './core/supabase'

let cached: SupabaseClient | null = null

export function getSupabaseAdminClient(): SupabaseClient {
  if (cached) {
    return cached
  } 

  // supabaseClient는 싱글톤이지만, Edge 런타임에서는 세션 유지를 비활성화한 새 인스턴스가 필요할 수 있습니다.
  // 여기서는 기존 클라이언트의 연결 정보를 재사용하여 새 클라이언트를 만듭니다.
  cached = createClient(supabaseClient.supabaseUrl, supabaseClient.supabaseKey, {
    auth: {
      persistSession: false
    }
  })

  return cached
}
