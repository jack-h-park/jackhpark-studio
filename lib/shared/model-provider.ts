export type ModelProvider = 'openai' | 'gemini' | 'huggingface'
export type ChatEngine = 'native' | 'lc'

export const MODEL_PROVIDERS: readonly ModelProvider[] = [
  'openai',
  'gemini',
  'huggingface'
] as const

export const MODEL_PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini (Google)',
  huggingface: 'Hugging Face (Under Development)'
}

const PROVIDER_ALIASES: Record<string, ModelProvider> = {
  openai: 'openai',
  oa: 'openai',
  'open-ai': 'openai',
  gpt: 'openai',
  chatgpt: 'openai',

  gemini: 'gemini',
  google: 'gemini',
  'google-ai': 'gemini',
  'google-ai-studio': 'gemini',

  huggingface: 'huggingface',
  'hugging-face': 'huggingface',
  hf: 'huggingface'
}

export function toModelProviderId(value: string | null | undefined): ModelProvider | null {
  if (!value) {
    return null
  }

  const key = value.toLowerCase().trim()
  return PROVIDER_ALIASES[key] ?? null
}

export function normalizeModelProvider(
  value: string | null | undefined,
  fallback: ModelProvider = 'openai'
): ModelProvider {
  return toModelProviderId(value) ?? fallback
}

export function normalizeChatEngine(
  value: string | null | undefined,
  fallback: ChatEngine = 'lc'
): ChatEngine {
  if (!value) return fallback
  const normalized = value.toLowerCase().trim()
  return normalized === 'native' || normalized === 'lc' ? (normalized as ChatEngine) : fallback
}

export function isModelProvider(value: unknown): value is ModelProvider {
  if (typeof value !== 'string') {
    return false
  }

  return MODEL_PROVIDERS.includes(value as ModelProvider)
}

export function isChatEngine(value: unknown): value is ChatEngine {
  if (typeof value !== 'string') return false
  return value === 'native' || value === 'lc'
}
