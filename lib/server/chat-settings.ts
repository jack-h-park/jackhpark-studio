import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import {
  CHAT_SETTINGS_TABLE,
  DEFAULT_SYSTEM_PROMPT,
  normalizeSystemPrompt,
  SYSTEM_PROMPT_CACHE_TTL_MS,
  SYSTEM_PROMPT_SETTING_KEY
} from '@/lib/chat-prompts'
import {
  normalizeEmbeddingProvider,
  normalizeLlmProvider,
  resolveEmbeddingSpace,
  resolveLlmModel
} from '@/lib/core/model-provider'
import { supabaseClient } from '@/lib/core/supabase'
import {
  type ChatEngine,
  type ModelProvider,
  normalizeChatEngine
} from '@/lib/shared/model-provider'

const GUARDRAIL_SETTINGS_CACHE_TTL_MS = 60_000
const CHAT_MODEL_SETTINGS_CACHE_TTL_MS = 60_000
const CHITCHAT_KEYWORDS_SETTING_KEY = 'guardrail_chitchat_keywords'
const CHITCHAT_FALLBACK_SETTING_KEY = 'guardrail_fallback_chitchat'
const COMMAND_FALLBACK_SETTING_KEY = 'guardrail_fallback_command'
const SIMILARITY_THRESHOLD_SETTING_KEY = 'guardrail_similarity_threshold'
const RAG_TOP_K_SETTING_KEY = 'guardrail_rag_top_k'
const CONTEXT_TOKEN_BUDGET_SETTING_KEY = 'guardrail_context_token_budget'
const CONTEXT_CLIP_TOKENS_SETTING_KEY = 'guardrail_context_clip_tokens'
const HISTORY_TOKEN_BUDGET_SETTING_KEY = 'guardrail_history_token_budget'
const SUMMARY_ENABLED_SETTING_KEY = 'guardrail_summary_enabled'
const SUMMARY_TRIGGER_TOKENS_SETTING_KEY = 'guardrail_summary_trigger_tokens'
const SUMMARY_MAX_TURNS_SETTING_KEY = 'guardrail_summary_max_turns'
const SUMMARY_MAX_CHARS_SETTING_KEY = 'guardrail_summary_max_chars'
const GUARDRAIL_SETTING_KEYS = [
  CHITCHAT_KEYWORDS_SETTING_KEY,
  CHITCHAT_FALLBACK_SETTING_KEY,
  COMMAND_FALLBACK_SETTING_KEY,
  SIMILARITY_THRESHOLD_SETTING_KEY,
  RAG_TOP_K_SETTING_KEY,
  CONTEXT_TOKEN_BUDGET_SETTING_KEY,
  CONTEXT_CLIP_TOKENS_SETTING_KEY,
  HISTORY_TOKEN_BUDGET_SETTING_KEY,
  SUMMARY_ENABLED_SETTING_KEY,
  SUMMARY_TRIGGER_TOKENS_SETTING_KEY,
  SUMMARY_MAX_TURNS_SETTING_KEY,
  SUMMARY_MAX_CHARS_SETTING_KEY
] as const
const CHAT_ENGINE_SETTING_KEY = 'chat_engine'
const CHAT_LLM_PROVIDER_SETTING_KEY = 'chat_llm_provider'
const CHAT_EMBEDDING_PROVIDER_SETTING_KEY = 'chat_embedding_provider'
const CHAT_LLM_MODEL_SETTING_KEY = 'chat_llm_model'
const CHAT_EMBEDDING_MODEL_SETTING_KEY = 'chat_embedding_model'
const CHAT_EMBEDDING_SPACE_SETTING_KEY = 'chat_embedding_space_id'
const CHAT_MODEL_SETTING_KEYS = [
  CHAT_ENGINE_SETTING_KEY,
  CHAT_LLM_PROVIDER_SETTING_KEY,
  CHAT_EMBEDDING_PROVIDER_SETTING_KEY,
  CHAT_LLM_MODEL_SETTING_KEY,
  CHAT_EMBEDDING_MODEL_SETTING_KEY,
  CHAT_EMBEDDING_SPACE_SETTING_KEY
] as const
const LANGFUSE_ENV_SETTING_KEY = "langfuse_env";
const LANGFUSE_SAMPLE_RATE_DEV_SETTING_KEY = "langfuse_sample_rate_dev";
const LANGFUSE_SAMPLE_RATE_PREVIEW_SETTING_KEY = "langfuse_sample_rate_preview";
const LANGFUSE_PROVIDER_METADATA_SETTING_KEY = "langfuse_attach_provider_metadata";
const LANGFUSE_SETTING_KEYS = [
  LANGFUSE_ENV_SETTING_KEY,
  LANGFUSE_SAMPLE_RATE_DEV_SETTING_KEY,
  LANGFUSE_SAMPLE_RATE_PREVIEW_SETTING_KEY,
  LANGFUSE_PROVIDER_METADATA_SETTING_KEY,
] as const;

export type GuardrailNumericSettings = {
  similarityThreshold: number
  ragTopK: number
  ragContextTokenBudget: number
  ragContextClipTokens: number
  historyTokenBudget: number
  summaryEnabled: boolean
  summaryTriggerTokens: number
  summaryMaxTurns: number
  summaryMaxChars: number
}

export type GuardrailDefaults = {
  chitchatKeywords: string[]
  fallbackChitchat: string
  fallbackCommand: string
  numeric: GuardrailNumericSettings
}

export type ChatModelSettings = {
  engine: ChatEngine
  llmModelId: string
  embeddingModelId: string
  embeddingSpaceId: string
  llmProvider: ModelProvider
  embeddingProvider: ModelProvider
  llmModel: string
  embeddingModel: string
  isDefault: {
    engine: boolean
    llmProvider: boolean
    embeddingProvider: boolean
    llmModel: boolean
    embeddingModel: boolean
    embeddingSpaceId: boolean
  }
}

export type ChatModelSettingsInput = {
  engine: ChatEngine
  llmProvider?: ModelProvider
  embeddingProvider?: ModelProvider
  embeddingSpaceId?: string | null
  llmModel?: string | null
  embeddingModel?: string | null
}

export type LangfuseSettings = {
  envTag: string;
  sampleRateDev: number;
  sampleRatePreview: number;
  attachProviderMetadata: boolean;
  isDefault: {
    envTag: boolean;
    sampleRateDev: boolean;
    sampleRatePreview: boolean;
    attachProviderMetadata: boolean;
  };
};

export type LangfuseSettingsInput = {
  envTag: string;
  sampleRateDev: number;
  sampleRatePreview: number;
  attachProviderMetadata: boolean;
};

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

const DEFAULT_SIMILARITY_THRESHOLD = clampNumber(
  Number(process.env.RAG_SIMILARITY_THRESHOLD ?? 0.78),
  0,
  1
)
const DEFAULT_RAG_TOP_K = ensureMin(
  Number(process.env.RAG_TOP_K ?? 5),
  1
)
const DEFAULT_CONTEXT_TOKEN_BUDGET = ensureMin(
  Number(process.env.CHAT_CONTEXT_TOKEN_BUDGET ?? 1200),
  200
)
const DEFAULT_CONTEXT_CLIP_TOKENS = ensureMin(
  Number(process.env.CHAT_CONTEXT_CLIP_TOKENS ?? 320),
  64
)
const DEFAULT_HISTORY_TOKEN_BUDGET = ensureMin(
  Number(process.env.CHAT_HISTORY_TOKEN_BUDGET ?? 900),
  200
)
const DEFAULT_SUMMARY_ENABLED =
  (process.env.CHAT_SUMMARY_ENABLED ?? 'true').toLowerCase() !== 'false'
const DEFAULT_SUMMARY_TRIGGER_TOKENS = ensureMin(
  Number(process.env.CHAT_SUMMARY_TRIGGER_TOKENS ?? 400),
  200
)
const DEFAULT_SUMMARY_MAX_TURNS = ensureMin(
  Number(process.env.CHAT_SUMMARY_MAX_TURNS ?? 6),
  2
)
const DEFAULT_SUMMARY_MAX_CHARS = ensureMin(
  Number(process.env.CHAT_SUMMARY_MAX_CHARS ?? 600),
  200
)

const DEFAULT_NUMERIC_SETTINGS: GuardrailNumericSettings = {
  similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
  ragTopK: DEFAULT_RAG_TOP_K,
  ragContextTokenBudget: DEFAULT_CONTEXT_TOKEN_BUDGET,
  ragContextClipTokens: DEFAULT_CONTEXT_CLIP_TOKENS,
  historyTokenBudget: DEFAULT_HISTORY_TOKEN_BUDGET,
  summaryEnabled: DEFAULT_SUMMARY_ENABLED,
  summaryTriggerTokens: DEFAULT_SUMMARY_TRIGGER_TOKENS,
  summaryMaxTurns: DEFAULT_SUMMARY_MAX_TURNS,
  summaryMaxChars: DEFAULT_SUMMARY_MAX_CHARS
}

const GUARDRAIL_DEFAULTS: GuardrailDefaults = {
  chitchatKeywords: DEFAULT_CHITCHAT_KEYWORDS,
  fallbackChitchat: DEFAULT_CHITCHAT_FALLBACK,
  fallbackCommand: DEFAULT_COMMAND_FALLBACK,
  numeric: { ...DEFAULT_NUMERIC_SETTINGS }
}

function getDefaultEngine(): ChatEngine {
  return normalizeChatEngine(process.env.CHAT_ENGINE, 'lc')
}

function clampSampleRate(
  candidate: string | number | undefined,
  fallback: number,
): number {
  if (candidate === undefined || candidate === null) {
    return fallback;
  }
  const parsed =
    typeof candidate === "number" ? candidate : Number(candidate);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

export function getChatModelDefaults(): ChatModelSettings {
  const engine = getDefaultEngine()
  const defaultLlm = resolveLlmModel()
  const defaultEmbedding = resolveEmbeddingSpace()

  return {
    engine,
    llmModelId: defaultLlm.id,
    embeddingModelId: defaultEmbedding.embeddingModelId,
    embeddingSpaceId: defaultEmbedding.embeddingSpaceId,
    llmProvider: defaultLlm.provider,
    embeddingProvider: defaultEmbedding.provider,
    llmModel: defaultLlm.model,
    embeddingModel: defaultEmbedding.model,
    isDefault: {
      engine: true,
      llmProvider: true,
      embeddingProvider: true,
      llmModel: true,
      embeddingModel: true,
      embeddingSpaceId: true
    }
  }
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
    numeric: {
      [K in keyof GuardrailNumericSettings]: boolean
    }
  }
}

let cachedPrompt: SystemPromptResult | null = null
let cachedPromptAt = 0
let cachedGuardrails: GuardrailSettingsResult | null = null
let cachedGuardrailsAt = 0
let cachedChatModelSettings: ChatModelSettings | null = null
let cachedChatModelSettingsAt = 0
let cachedLangfuseSettings: LangfuseSettings | null = null;
let cachedLangfuseSettingsAt = 0;

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

function cacheChatModelSettings(settings: ChatModelSettings) {
  cachedChatModelSettings = settings
  cachedChatModelSettingsAt = Date.now()
}
function cacheLangfuseSettings(settings: LangfuseSettings) {
  cachedLangfuseSettings = settings;
  cachedLangfuseSettingsAt = Date.now();
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
    fallbackCommand: GUARDRAIL_DEFAULTS.fallbackCommand,
    numeric: { ...GUARDRAIL_DEFAULTS.numeric }
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
  const numericOverrides = {
    similarityThreshold: settingsMap.get(SIMILARITY_THRESHOLD_SETTING_KEY),
    ragTopK: settingsMap.get(RAG_TOP_K_SETTING_KEY),
    ragContextTokenBudget: settingsMap.get(CONTEXT_TOKEN_BUDGET_SETTING_KEY),
    ragContextClipTokens: settingsMap.get(CONTEXT_CLIP_TOKENS_SETTING_KEY),
    historyTokenBudget: settingsMap.get(HISTORY_TOKEN_BUDGET_SETTING_KEY),
    summaryEnabled: settingsMap.get(SUMMARY_ENABLED_SETTING_KEY),
    summaryTriggerTokens: settingsMap.get(SUMMARY_TRIGGER_TOKENS_SETTING_KEY),
    summaryMaxTurns: settingsMap.get(SUMMARY_MAX_TURNS_SETTING_KEY),
    summaryMaxChars: settingsMap.get(SUMMARY_MAX_CHARS_SETTING_KEY)
  }

  const result = buildGuardrailResult({
    keywords: keywordsRaw,
    fallbackChitchat: fallbackChitchatRaw,
    fallbackCommand: fallbackCommandRaw,
    numeric: numericOverrides
  })

  cacheGuardrails(result)
  return result
}

export async function loadChatModelSettings(options?: {
  forceRefresh?: boolean
  client?: SupabaseClient
}): Promise<ChatModelSettings> {
  const shouldUseCache =
    !options?.forceRefresh &&
    cachedChatModelSettings &&
    Date.now() - cachedChatModelSettingsAt < CHAT_MODEL_SETTINGS_CACHE_TTL_MS

  if (shouldUseCache && cachedChatModelSettings) {
    return cachedChatModelSettings
  }

  const client = getClient(options?.client)
  const { data, error } = await client
    .from(CHAT_SETTINGS_TABLE)
    .select('key, value')
    .in('key', [...CHAT_MODEL_SETTING_KEYS])

  if (error) {
    if (isMissingChatSettingsTable(error)) {
      console.warn(
        '[chat-settings] chat_settings table missing; falling back to default chat model settings'
      )
      const fallback = getChatModelDefaults()
      cacheChatModelSettings(fallback)
      return fallback
    }

    console.error('[chat-settings] failed to load chat model settings', error)
    throw new Error('Failed to load chat model settings')
  }

  const settingsMap = new Map<string, string>(
    (data ?? []).map((row: { key: string; value: string }) => [row.key, row.value])
  )

  const defaults = getChatModelDefaults()
  const defaultLlm = resolveLlmModel()
  const defaultEmbedding = resolveEmbeddingSpace()

  const engineSetting = resolveEngineSetting(
    settingsMap.get(CHAT_ENGINE_SETTING_KEY),
    defaults.engine
  )
  const llmProviderSetting = resolveProviderSetting(
    settingsMap.get(CHAT_LLM_PROVIDER_SETTING_KEY),
    defaults.llmProvider,
    normalizeLlmProvider
  )
  const embeddingProviderSetting = resolveProviderSetting(
    settingsMap.get(CHAT_EMBEDDING_PROVIDER_SETTING_KEY),
    defaults.embeddingProvider,
    normalizeEmbeddingProvider
  )
  const llmModelSetting = settingsMap.get(CHAT_LLM_MODEL_SETTING_KEY) ?? null
  const embeddingModelSetting = settingsMap.get(CHAT_EMBEDDING_MODEL_SETTING_KEY) ?? null
  const embeddingSpaceSetting = settingsMap.get(CHAT_EMBEDDING_SPACE_SETTING_KEY) ?? null

  const llmSelection = resolveLlmModel({
    provider: llmProviderSetting.value,
    modelId: llmModelSetting,
    model: llmModelSetting
  })
  const embeddingSelection = resolveEmbeddingSpace({
    provider: embeddingProviderSetting.value,
    embeddingModelId: embeddingModelSetting,
    embeddingSpaceId: embeddingSpaceSetting,
    model: embeddingModelSetting
  })

  const result: ChatModelSettings = {
    engine: engineSetting.value,
    llmModelId: llmSelection.id,
    embeddingModelId: embeddingSelection.embeddingModelId,
    embeddingSpaceId: embeddingSelection.embeddingSpaceId,
    llmProvider: llmSelection.provider,
    embeddingProvider: embeddingSelection.provider,
    llmModel: llmSelection.model,
    embeddingModel: embeddingSelection.model,
    isDefault: {
      engine: engineSetting.isDefault,
      llmProvider: llmProviderSetting.isDefault,
      embeddingProvider: embeddingProviderSetting.isDefault,
      llmModel:
        !llmModelSetting || llmSelection.id === defaultLlm.id,
      embeddingModel:
        (!embeddingModelSetting ||
          embeddingSelection.embeddingModelId === defaultEmbedding.embeddingModelId) &&
        (!embeddingSpaceSetting ||
          embeddingSelection.embeddingSpaceId === defaultEmbedding.embeddingSpaceId),
      embeddingSpaceId:
        !embeddingSpaceSetting ||
        embeddingSelection.embeddingSpaceId === defaultEmbedding.embeddingSpaceId
    }
  }

  cacheChatModelSettings(result)
  return result
}

export async function saveChatModelSettings(
  input: ChatModelSettingsInput,
  options?: { client?: SupabaseClient }
): Promise<ChatModelSettings> {
  const engine = normalizeChatEngine(input.engine, getDefaultEngine())
  const llmSelection = resolveLlmModel({
    provider: input.llmProvider,
    modelId: input.llmModel,
    model: input.llmModel
  })
  const embeddingSelection = resolveEmbeddingSpace({
    provider: input.embeddingProvider ?? llmSelection.provider,
    embeddingModelId: input.embeddingModel,
    embeddingSpaceId: input.embeddingSpaceId,
    model: input.embeddingModel
  })

  const payload = [
    { key: CHAT_ENGINE_SETTING_KEY, value: engine },
    { key: CHAT_LLM_PROVIDER_SETTING_KEY, value: llmSelection.provider },
    { key: CHAT_EMBEDDING_PROVIDER_SETTING_KEY, value: embeddingSelection.provider },
    { key: CHAT_LLM_MODEL_SETTING_KEY, value: llmSelection.id },
    { key: CHAT_EMBEDDING_MODEL_SETTING_KEY, value: embeddingSelection.embeddingModelId },
    { key: CHAT_EMBEDDING_SPACE_SETTING_KEY, value: embeddingSelection.embeddingSpaceId }
  ]

  const client = getClient(options?.client)
  const { error } = await client
    .from(CHAT_SETTINGS_TABLE)
    .upsert(payload, { onConflict: 'key' })

  if (error) {
    if (isMissingChatSettingsTable(error)) {
      throw new Error(
        'chat_settings table is missing. Create it before updating chat model settings.'
      )
    }

    console.error('[chat-settings] failed to persist chat model settings', error)
    throw new Error('Failed to update chat model settings')
  }

  const result = await loadChatModelSettings({ forceRefresh: true, client })
  return result
}

export type GuardrailNumericInput = GuardrailNumericSettings

export type GuardrailSettingsInput = {
  chitchatKeywords: string
  fallbackChitchat: string
  fallbackCommand: string
  numeric: GuardrailNumericInput
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

  const numeric = validateNumericInput(input.numeric)

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
    },
    {
      key: SIMILARITY_THRESHOLD_SETTING_KEY,
      value: numeric.similarityThreshold.toString()
    },
    {
      key: RAG_TOP_K_SETTING_KEY,
      value: numeric.ragTopK.toString()
    },
    {
      key: CONTEXT_TOKEN_BUDGET_SETTING_KEY,
      value: numeric.ragContextTokenBudget.toString()
    },
    {
      key: CONTEXT_CLIP_TOKENS_SETTING_KEY,
      value: numeric.ragContextClipTokens.toString()
    },
    {
      key: HISTORY_TOKEN_BUDGET_SETTING_KEY,
      value: numeric.historyTokenBudget.toString()
    },
    {
      key: SUMMARY_ENABLED_SETTING_KEY,
      value: numeric.summaryEnabled ? 'true' : 'false'
    },
    {
      key: SUMMARY_TRIGGER_TOKENS_SETTING_KEY,
      value: numeric.summaryTriggerTokens.toString()
    },
    {
      key: SUMMARY_MAX_TURNS_SETTING_KEY,
      value: numeric.summaryMaxTurns.toString()
    },
    {
      key: SUMMARY_MAX_CHARS_SETTING_KEY,
      value: numeric.summaryMaxChars.toString()
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

export function getLangfuseDefaults(): LangfuseSettings {
  return {
    envTag: DEFAULT_LANGFUSE_SETTINGS.envTag,
    sampleRateDev: DEFAULT_LANGFUSE_SETTINGS.sampleRateDev,
    sampleRatePreview: DEFAULT_LANGFUSE_SETTINGS.sampleRatePreview,
    attachProviderMetadata: DEFAULT_LANGFUSE_SETTINGS.attachProviderMetadata,
    isDefault: {
      envTag: true,
      sampleRateDev: true,
      sampleRatePreview: true,
      attachProviderMetadata: true,
    },
  };
}

export async function loadLangfuseSettings(options?: {
  forceRefresh?: boolean;
  client?: SupabaseClient;
}): Promise<LangfuseSettings> {
  const shouldUseCache =
    !options?.forceRefresh &&
    cachedLangfuseSettings &&
    Date.now() - cachedLangfuseSettingsAt <
      LANGFUSE_SETTINGS_CACHE_TTL_MS;

  if (shouldUseCache && cachedLangfuseSettings) {
    return cachedLangfuseSettings;
  }

  const client = getClient(options?.client);
  const { data, error } = await client
    .from(CHAT_SETTINGS_TABLE)
    .select("key, value")
    .in("key", [...LANGFUSE_SETTING_KEYS]);

  if (error) {
    if (isMissingChatSettingsTable(error)) {
      console.warn(
        "[chat-settings] chat_settings table missing; using default Langfuse settings",
      );
      const fallback = getLangfuseDefaults();
      cacheLangfuseSettings(fallback);
      return fallback;
    }
    console.error(
      "[chat-settings] failed to load Langfuse settings",
      error,
    );
    throw new Error("Failed to load Langfuse settings");
  }

  const map = new Map<string, string>(
    (data ?? []).map((row: { key: string; value: string }) => [
      row.key,
      row.value,
    ]),
  );
  const result = buildLangfuseSettings(map);
  cacheLangfuseSettings(result);
  return result;
}

export async function saveLangfuseSettings(
  input: LangfuseSettingsInput,
  options?: { client?: SupabaseClient },
): Promise<LangfuseSettings> {
  const envTag = input.envTag.trim();
  if (!envTag) {
    throw new Error("Environment tag cannot be empty.");
  }

  const devRate = clampSampleRate(input.sampleRateDev, DEFAULT_LANGFUSE_SAMPLE_RATE_DEV);
  const previewRate = clampSampleRate(
    input.sampleRatePreview,
    DEFAULT_LANGFUSE_SAMPLE_RATE_PREVIEW,
  );

  const payload = [
    { key: LANGFUSE_ENV_SETTING_KEY, value: envTag },
    {
      key: LANGFUSE_SAMPLE_RATE_DEV_SETTING_KEY,
      value: devRate.toString(),
    },
    {
      key: LANGFUSE_SAMPLE_RATE_PREVIEW_SETTING_KEY,
      value: previewRate.toString(),
    },
    {
      key: LANGFUSE_PROVIDER_METADATA_SETTING_KEY,
      value: input.attachProviderMetadata ? "true" : "false",
    },
  ];

  const client = getClient(options?.client);
  const { error } = await client
    .from(CHAT_SETTINGS_TABLE)
    .upsert(payload, { onConflict: "key" });

  if (error) {
    if (isMissingChatSettingsTable(error)) {
      throw new Error(
        "chat_settings table is missing. Create it before updating Langfuse settings.",
      );
    }
    console.error(
      "[chat-settings] failed to persist Langfuse settings",
      error,
    );
    throw new Error("Failed to update Langfuse settings");
  }

  const result = await loadLangfuseSettings({
    forceRefresh: true,
    client,
  });
  return result;
}

function buildLangfuseSettings(
  map?: Map<string, string>,
): LangfuseSettings {
  const envOverride = map?.get(LANGFUSE_ENV_SETTING_KEY);
  const sampleRateDevOverride = map?.get(
    LANGFUSE_SAMPLE_RATE_DEV_SETTING_KEY,
  );
  const sampleRatePreviewOverride = map?.get(
    LANGFUSE_SAMPLE_RATE_PREVIEW_SETTING_KEY,
  );
  const metadataOverride = map?.get(LANGFUSE_PROVIDER_METADATA_SETTING_KEY);

  const envTag =
    envOverride?.trim().length
      ? envOverride.trim()
      : DEFAULT_LANGFUSE_SETTINGS.envTag;
  const sampleRateDev = clampSampleRate(
    sampleRateDevOverride,
    DEFAULT_LANGFUSE_SETTINGS.sampleRateDev,
  );
  const sampleRatePreview = clampSampleRate(
    sampleRatePreviewOverride,
    DEFAULT_LANGFUSE_SETTINGS.sampleRatePreview,
  );
  const attachProviderMetadata =
    metadataOverride === undefined
      ? DEFAULT_LANGFUSE_SETTINGS.attachProviderMetadata
      : metadataOverride.toLowerCase() !== "false";

  return {
    envTag,
    sampleRateDev,
    sampleRatePreview,
    attachProviderMetadata,
    isDefault: {
      envTag: !envOverride,
      sampleRateDev: !sampleRateDevOverride,
      sampleRatePreview: !sampleRatePreviewOverride,
      attachProviderMetadata: !metadataOverride,
    },
  };
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
    numeric?: Partial<Record<keyof GuardrailNumericSettings, string | undefined>>
  }
): GuardrailSettingsResult {
  const keywordsSource = normalizeOptionalValue(overrides?.keywords)
  const fallbackChitchatSource = normalizeOptionalValue(overrides?.fallbackChitchat)
  const fallbackCommandSource = normalizeOptionalValue(overrides?.fallbackCommand)
  const numericResult = buildNumericSettings(overrides?.numeric)

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
    numeric: numericResult.values,
    isDefault: {
      chitchatKeywords: !keywordsSource,
      fallbackChitchat: !fallbackChitchatSource,
      fallbackCommand: !fallbackCommandSource,
      numeric: numericResult.isDefault
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

function resolveEngineSetting(
  raw: string | undefined,
  fallback: ChatEngine
): { value: ChatEngine; isDefault: boolean } {
  if (raw === undefined) {
    return { value: fallback, isDefault: true }
  }
  const normalized = normalizeChatEngine(raw, fallback)
  return { value: normalized, isDefault: normalized === fallback }
}

function resolveProviderSetting(
  raw: string | undefined,
  fallback: ModelProvider,
  normalizer: (value: string | null | undefined) => ModelProvider
): { value: ModelProvider; isDefault: boolean } {
  if (raw === undefined) {
    return { value: fallback, isDefault: true }
  }

  const normalized = normalizer(raw)
  return { value: normalized, isDefault: normalized === fallback }
}

function buildNumericSettings(
  overrides?: Partial<Record<keyof GuardrailNumericSettings, string | undefined>>
): {
  values: GuardrailNumericSettings
  isDefault: { [K in keyof GuardrailNumericSettings]: boolean }
} {
  const defaults = GUARDRAIL_DEFAULTS.numeric
  const similarity = resolveNumericSetting(overrides?.similarityThreshold, defaults.similarityThreshold, {
    min: 0,
    max: 1
  })
  const ragTopK = resolveNumericSetting(overrides?.ragTopK, defaults.ragTopK, {
    min: 1,
    integer: true
  })
  const contextBudget = resolveNumericSetting(
    overrides?.ragContextTokenBudget,
    defaults.ragContextTokenBudget,
    { min: 200, integer: true }
  )
  const clipTokens = resolveNumericSetting(
    overrides?.ragContextClipTokens,
    defaults.ragContextClipTokens,
    { min: 64, integer: true }
  )
  const historyBudget = resolveNumericSetting(
    overrides?.historyTokenBudget,
    defaults.historyTokenBudget,
    { min: 200, integer: true }
  )
  const summaryEnabled = resolveBooleanSetting(overrides?.summaryEnabled, defaults.summaryEnabled)
  const summaryTrigger = resolveNumericSetting(
    overrides?.summaryTriggerTokens,
    defaults.summaryTriggerTokens,
    { min: 200, integer: true }
  )
  const summaryTurns = resolveNumericSetting(
    overrides?.summaryMaxTurns,
    defaults.summaryMaxTurns,
    { min: 2, integer: true }
  )
  const summaryChars = resolveNumericSetting(
    overrides?.summaryMaxChars,
    defaults.summaryMaxChars,
    { min: 200, integer: true }
  )

  return {
    values: {
      similarityThreshold: similarity.value,
      ragTopK: ragTopK.value,
      ragContextTokenBudget: contextBudget.value,
      ragContextClipTokens: clipTokens.value,
      historyTokenBudget: historyBudget.value,
      summaryEnabled: summaryEnabled.value,
      summaryTriggerTokens: summaryTrigger.value,
      summaryMaxTurns: summaryTurns.value,
      summaryMaxChars: summaryChars.value
    },
    isDefault: {
      similarityThreshold: similarity.isDefault,
      ragTopK: ragTopK.isDefault,
      ragContextTokenBudget: contextBudget.isDefault,
      ragContextClipTokens: clipTokens.isDefault,
      historyTokenBudget: historyBudget.isDefault,
      summaryEnabled: summaryEnabled.isDefault,
      summaryTriggerTokens: summaryTrigger.isDefault,
      summaryMaxTurns: summaryTurns.isDefault,
      summaryMaxChars: summaryChars.isDefault
    }
  }
}

function resolveNumericSetting(
  raw: string | undefined,
  fallback: number,
  options?: { min?: number; max?: number; integer?: boolean }
): { value: number; isDefault: boolean } {
  if (raw === undefined) {
    return { value: fallback, isDefault: true }
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return { value: fallback, isDefault: true }
  }
  const min = options?.min ?? Number.NEGATIVE_INFINITY
  const max = options?.max ?? Number.POSITIVE_INFINITY
  let normalized = clampNumber(parsed, min, max)
  if (options?.integer) {
    normalized = clampNumber(Math.round(normalized), min, max)
  }
  return { value: normalized, isDefault: false }
}

function resolveBooleanSetting(
  raw: string | undefined,
  fallback: boolean
): { value: boolean; isDefault: boolean } {
  if (raw === undefined) {
    return { value: fallback, isDefault: true }
  }

  const normalized = raw.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') {
    return { value: true, isDefault: false }
  }
  if (normalized === 'false' || normalized === '0') {
    return { value: false, isDefault: false }
  }

  return { value: fallback, isDefault: true }
}

function validateNumericInput(input?: GuardrailNumericInput): GuardrailNumericSettings {
  if (!input) {
    throw new Error('Numeric guardrail settings are required.')
  }

  return {
    similarityThreshold: clampNumber(
      ensureNumberField(input.similarityThreshold, 'Similarity threshold'),
      0,
      1
    ),
    ragTopK: ensureMin(Math.round(ensureNumberField(input.ragTopK, 'RAG top K')), 1),
    ragContextTokenBudget: ensureMin(
      Math.round(ensureNumberField(input.ragContextTokenBudget, 'Context token budget')),
      200
    ),
    ragContextClipTokens: ensureMin(
      Math.round(ensureNumberField(input.ragContextClipTokens, 'Context clip tokens')),
      64
    ),
    historyTokenBudget: ensureMin(
      Math.round(ensureNumberField(input.historyTokenBudget, 'History token budget')),
      200
    ),
    summaryEnabled: ensureBooleanField(input.summaryEnabled, 'Summary enabled'),
    summaryTriggerTokens: ensureMin(
      Math.round(ensureNumberField(input.summaryTriggerTokens, 'Summary trigger tokens')),
      200
    ),
    summaryMaxTurns: ensureMin(
      Math.round(ensureNumberField(input.summaryMaxTurns, 'Summary max turns')),
      2
    ),
    summaryMaxChars: ensureMin(
      Math.round(ensureNumberField(input.summaryMaxChars, 'Summary max chars')),
      200
    )
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

function ensureMin(value: number, min: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.max(min, value)
}

function ensureNumberField(value: number | undefined, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a valid number.`)
  }
  return value
}

function ensureBooleanField(value: boolean | undefined, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be true or false.`)
  }
  return value
}
const LANGFUSE_SETTINGS_CACHE_TTL_MS = 60_000;
const DEFAULT_LANGFUSE_ENV_TAG =
  process.env.LANGFUSE_ENV_TAG ??
  process.env.APP_ENV ??
  process.env.NODE_ENV ??
  "dev";
const DEFAULT_LANGFUSE_SAMPLE_RATE_DEV = clampSampleRate(
  process.env.LANGFUSE_SAMPLE_RATE_DEV,
  0.3,
);
const DEFAULT_LANGFUSE_SAMPLE_RATE_PREVIEW = clampSampleRate(
  process.env.LANGFUSE_SAMPLE_RATE_PREVIEW,
  1,
);
const DEFAULT_LANGFUSE_ATTACH_PROVIDER_METADATA =
  (process.env.LANGFUSE_ATTACH_PROVIDER_METADATA ?? "true").toLowerCase() !==
  "false";

const DEFAULT_LANGFUSE_SETTINGS = {
  envTag: DEFAULT_LANGFUSE_ENV_TAG,
  sampleRateDev: DEFAULT_LANGFUSE_SAMPLE_RATE_DEV,
  sampleRatePreview: DEFAULT_LANGFUSE_SAMPLE_RATE_PREVIEW,
  attachProviderMetadata: DEFAULT_LANGFUSE_ATTACH_PROVIDER_METADATA,
} as const;
