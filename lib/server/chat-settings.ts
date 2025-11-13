import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import {
  CHAT_SETTINGS_TABLE,
  DEFAULT_SYSTEM_PROMPT,
  normalizeSystemPrompt,
  SYSTEM_PROMPT_CACHE_TTL_MS,
  SYSTEM_PROMPT_SETTING_KEY
} from '@/lib/chat-prompts'
import { supabaseClient } from '@/lib/core/supabase'

const GUARDRAIL_SETTINGS_CACHE_TTL_MS = 60_000
const CHITCHAT_KEYWORDS_SETTING_KEY = 'guardrail_chitchat_keywords'
const CHITCHAT_FALLBACK_SETTING_KEY = 'guardrail_fallback_chitchat'
const COMMAND_FALLBACK_SETTING_KEY = 'guardrail_fallback_command'
const GUARDRAIL_SETTING_KEYS = [
  CHITCHAT_KEYWORDS_SETTING_KEY,
  CHITCHAT_FALLBACK_SETTING_KEY,
  COMMAND_FALLBACK_SETTING_KEY
] as const

export type GuardrailDefaults = {
  chitchatKeywords: string[]
  fallbackChitchat: string
  fallbackCommand: string
}

const DEFAULT_CHITCHAT_KEYWORDS = parseKeywordList(
  process.env.CHAT_CHITCHAT_KEYWORDS ??
    'hello,hi,how are you,whats up,what is up,tell me a joke,thank you,thanks,lol,haha,good morning,good evening'
)

const DEFAULT_CHITCHAT_FALLBACK = normalizeGuardrailText(
  process.env.CHAT_FALLBACK_CHITCHAT_CONTEXT ??
    'This is a light-weight chit-chat turn. Keep the response concise, warm, and avoid citing the knowledge base.'
)

const DEFAULT_COMMAND_FALLBACK = normalizeGuardrailText(
  process.env.CHAT_FALLBACK_COMMAND_CONTEXT ??
    'The user is asking for an action/command. You must politely decline to execute actions and instead explain what is possible.'
)

const GUARDRAIL_DEFAULTS: GuardrailDefaults = {
  chitchatKeywords: DEFAULT_CHITCHAT_KEYWORDS,
  fallbackChitchat: DEFAULT_CHITCHAT_FALLBACK,
  fallbackCommand: DEFAULT_COMMAND_FALLBACK
}

export type SystemPromptResult = {
  prompt: string
  isDefault: boolean
}

export type GuardrailSettingsResult = GuardrailDefaults & {
  isDefault: {
    chitchatKeywords: boolean
    fallbackChitchat: boolean
    fallbackCommand: boolean
  }
}

let cachedPrompt: SystemPromptResult | null = null
let cachedPromptAt = 0
let cachedGuardrails: GuardrailSettingsResult | null = null
let cachedGuardrailsAt = 0

function getClient(client?: SupabaseClient) {
  return client ?? supabaseClient
}

function isMissingChatSettingsTable(error: PostgrestError | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST116'
}

function cachePrompt(result: SystemPromptResult) {
  cachedPrompt = result
  cachedPromptAt = Date.now()
}

function cacheGuardrails(settings: GuardrailSettingsResult) {
  cachedGuardrails = settings
  cachedGuardrailsAt = Date.now()
}

export async function loadSystemPrompt(options?: {
  forceRefresh?: boolean
  client?: SupabaseClient
}): Promise<SystemPromptResult> {
  const shouldUseCache =
    !options?.forceRefresh &&
    cachedPrompt &&
    Date.now() - cachedPromptAt < SYSTEM_PROMPT_CACHE_TTL_MS

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
  cachedPromptAt = 0
}

export function getGuardrailDefaults(): GuardrailDefaults {
  return {
    chitchatKeywords: [...GUARDRAIL_DEFAULTS.chitchatKeywords],
    fallbackChitchat: GUARDRAIL_DEFAULTS.fallbackChitchat,
    fallbackCommand: GUARDRAIL_DEFAULTS.fallbackCommand
  }
}

export async function loadGuardrailSettings(options?: {
  forceRefresh?: boolean
  client?: SupabaseClient
}): Promise<GuardrailSettingsResult> {
  const shouldUseCache =
    !options?.forceRefresh &&
    cachedGuardrails &&
    Date.now() - cachedGuardrailsAt < GUARDRAIL_SETTINGS_CACHE_TTL_MS

  if (shouldUseCache && cachedGuardrails) {
    return cachedGuardrails
  }

  const client = getClient(options?.client)
  const { data, error } = await client
    .from(CHAT_SETTINGS_TABLE)
    .select('key, value')
    .in('key', [...GUARDRAIL_SETTING_KEYS])

  if (error) {
    if (isMissingChatSettingsTable(error)) {
      console.warn(
        '[chat-settings] chat_settings table missing; falling back to default guardrail settings'
      )
      const fallback = buildGuardrailResult()
      cacheGuardrails(fallback)
      return fallback
    }

    console.error('[chat-settings] failed to load guardrail settings', error)
    throw new Error('Failed to load guardrail settings')
  }

  const settingsMap = new Map<string, string>(
    (data ?? []).map((row: { key: string; value: string }) => [row.key, row.value])
  )

  const keywordsRaw = settingsMap.get(CHITCHAT_KEYWORDS_SETTING_KEY)
  const fallbackChitchatRaw = settingsMap.get(CHITCHAT_FALLBACK_SETTING_KEY)
  const fallbackCommandRaw = settingsMap.get(COMMAND_FALLBACK_SETTING_KEY)

  const result = buildGuardrailResult({
    keywords: keywordsRaw,
    fallbackChitchat: fallbackChitchatRaw,
    fallbackCommand: fallbackCommandRaw
  })

  cacheGuardrails(result)
  return result
}

export type GuardrailSettingsInput = {
  chitchatKeywords: string
  fallbackChitchat: string
  fallbackCommand: string
}

export async function saveGuardrailSettings(
  input: GuardrailSettingsInput,
  options?: { client?: SupabaseClient }
): Promise<GuardrailSettingsResult> {
  const keywords = parseKeywordList(input.chitchatKeywords)
  if (keywords.length === 0) {
    throw new Error('Provide at least one chit-chat keyword or phrase.')
  }

  const fallbackChitchat = normalizeGuardrailText(input.fallbackChitchat)
  if (!fallbackChitchat) {
    throw new Error('Chit-chat fallback context cannot be empty.')
  }

  const fallbackCommand = normalizeGuardrailText(input.fallbackCommand)
  if (!fallbackCommand) {
    throw new Error('Command fallback context cannot be empty.')
  }

  const payload = [
    {
      key: CHITCHAT_KEYWORDS_SETTING_KEY,
      value: keywords.join('\n')
    },
    {
      key: CHITCHAT_FALLBACK_SETTING_KEY,
      value: fallbackChitchat
    },
    {
      key: COMMAND_FALLBACK_SETTING_KEY,
      value: fallbackCommand
    }
  ]

  const client = getClient(options?.client)
  const { error } = await client
    .from(CHAT_SETTINGS_TABLE)
    .upsert(payload, { onConflict: 'key' })

  if (error) {
    if (isMissingChatSettingsTable(error)) {
      throw new Error(
        'chat_settings table is missing. Create it before updating guardrail settings.'
      )
    }

    console.error('[chat-settings] failed to persist guardrail settings', error)
    throw new Error('Failed to update guardrail settings')
  }

  const result = await loadGuardrailSettings({
    forceRefresh: true,
    client
  })
  return result
}

export function clearGuardrailSettingsCache() {
  cachedGuardrails = null
  cachedGuardrailsAt = 0
}

function buildGuardrailResult(
  overrides?: {
    keywords?: string
    fallbackChitchat?: string
    fallbackCommand?: string
  }
): GuardrailSettingsResult {
  const keywordsSource = normalizeOptionalValue(overrides?.keywords)
  const fallbackChitchatSource = normalizeOptionalValue(overrides?.fallbackChitchat)
  const fallbackCommandSource = normalizeOptionalValue(overrides?.fallbackCommand)

  const keywordList = keywordsSource
    ? parseKeywordList(keywordsSource)
    : GUARDRAIL_DEFAULTS.chitchatKeywords
  const keywords = [...keywordList]
  const fallbackChitchat = fallbackChitchatSource
    ? normalizeGuardrailText(fallbackChitchatSource)
    : GUARDRAIL_DEFAULTS.fallbackChitchat
  const fallbackCommand = fallbackCommandSource
    ? normalizeGuardrailText(fallbackCommandSource)
    : GUARDRAIL_DEFAULTS.fallbackCommand

  return {
    chitchatKeywords: keywords,
    fallbackChitchat,
    fallbackCommand,
    isDefault: {
      chitchatKeywords: !keywordsSource,
      fallbackChitchat: !fallbackChitchatSource,
      fallbackCommand: !fallbackCommandSource
    }
  }
}

function parseKeywordList(value: string | string[] | null | undefined): string[] {
  if (!value) {
    return []
  }

  const entries = Array.isArray(value) ? value : value.split(/\r?\n|,/)
  const normalized = entries
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)

  return Array.from(new Set(normalized))
}

function normalizeGuardrailText(value: string | null | undefined): string {
  if (!value) {
    return ''
  }
  return value.replaceAll('\r\n', '\n').trim()
}

function normalizeOptionalValue(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
