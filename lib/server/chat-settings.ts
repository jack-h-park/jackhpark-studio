import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import {
  CHAT_SETTINGS_TABLE,
  DEFAULT_SYSTEM_PROMPT,
  normalizeSystemPrompt,
  SYSTEM_PROMPT_CACHE_TTL_MS,
  SYSTEM_PROMPT_SETTING_KEY
} from '@/lib/chat-prompts'
import { supabaseClient } from '@/lib/core/supabase'

export type SystemPromptResult = {
  prompt: string
  isDefault: boolean
}

let cachedPrompt: SystemPromptResult | null = null
let cachedAt = 0

function getClient(client?: SupabaseClient) {
  return client ?? supabaseClient
}

function isMissingChatSettingsTable(error: PostgrestError | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST116'
}

function cachePrompt(result: SystemPromptResult) {
  cachedPrompt = result
  cachedAt = Date.now()
}

export async function loadSystemPrompt(options?: {
  forceRefresh?: boolean
  client?: SupabaseClient
}): Promise<SystemPromptResult> {
  const shouldUseCache =
    !options?.forceRefresh &&
    cachedPrompt &&
    Date.now() - cachedAt < SYSTEM_PROMPT_CACHE_TTL_MS

  if (shouldUseCache && cachedPrompt) {
    return cachedPrompt
  }

  const client = getClient(options?.client)
  const { data, error } = await client
    .from(CHAT_SETTINGS_TABLE)
    .select('value')
    .eq('key', SYSTEM_PROMPT_SETTING_KEY)
    .maybeSingle()

  if (error) {
    if (isMissingChatSettingsTable(error)) {
      console.warn(
        '[chat-settings] chat_settings table missing; falling back to default system prompt'
      )
      const fallback: SystemPromptResult = {
        prompt: DEFAULT_SYSTEM_PROMPT,
        isDefault: true
      }
      cachePrompt(fallback)
      return fallback
    }

    console.error('[chat-settings] failed to load system prompt', error)
    throw new Error('Failed to load system prompt')
  }

  const prompt = data?.value ? normalizeSystemPrompt(data.value) : DEFAULT_SYSTEM_PROMPT
  const result: SystemPromptResult = {
    prompt,
    isDefault: !data?.value
  }
  cachePrompt(result)
  return result
}

export async function saveSystemPrompt(
  prompt: string,
  options?: { client?: SupabaseClient }
): Promise<SystemPromptResult> {
  const normalized = normalizeSystemPrompt(prompt)

  if (!normalized) {
    throw new Error('System prompt cannot be empty')
  }

  const client = getClient(options?.client)
  const { data, error } = await client
    .from(CHAT_SETTINGS_TABLE)
    .upsert(
      {
        key: SYSTEM_PROMPT_SETTING_KEY,
        value: normalized
      },
      { onConflict: 'key' }
    )
    .select('value')
    .maybeSingle()

  if (error) {
    if (isMissingChatSettingsTable(error)) {
      throw new Error(
        'chat_settings table is missing. Create it before updating the system prompt.'
      )
    }

    console.error('[chat-settings] failed to persist system prompt', error)
    throw new Error('Failed to update system prompt')
  }

  const result: SystemPromptResult = {
    prompt: normalizeSystemPrompt(data?.value ?? normalized),
    isDefault: false
  }
  cachePrompt(result)
  return result
}

export function clearSystemPromptCache() {
  cachedPrompt = null
  cachedAt = 0
}
