export type ModelProvider = 'openai' | 'gemini' | 'huggingface'

export const MODEL_PROVIDERS: readonly ModelProvider[] = [
  'openai',
  'gemini',
  'huggingface'
] as const

export const MODEL_PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini (Google)',
  huggingface: 'Hugging Face'
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

export function isModelProvider(value: unknown): value is ModelProvider {
  if (typeof value !== 'string') {
    return false
  }

  return MODEL_PROVIDERS.includes(value as ModelProvider)
}
