import { type ModelProvider,normalizeModelProvider } from '@/lib/shared/model-provider'

type ProviderKeyConfig = {
  envKeys: string[]
  missingMessage: string
}

const DEFAULT_LLM_MODELS: Record<ModelProvider, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash-latest',
  huggingface: 'mistralai/Mixtral-8x7B-Instruct'
}

const DEFAULT_EMBEDDING_MODELS: Record<ModelProvider, string> = {
  openai: 'text-embedding-3-small',
  gemini: 'text-embedding-004',
  huggingface: 'sentence-transformers/all-MiniLM-L6-v2'
}

const PROVIDER_KEY_CONFIG: Record<ModelProvider, ProviderKeyConfig> = {
  openai: {
    envKeys: ['OPENAI_API_KEY'],
    missingMessage:
      'Missing OpenAI API key. Set the OPENAI_API_KEY environment variable.'
  },
  gemini: {
    envKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    missingMessage:
      'Missing Gemini API key. Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable.'
  },
  huggingface: {
    envKeys: ['HUGGINGFACE_API_KEY', 'HUGGINGFACEHUB_API_TOKEN'],
    missingMessage:
      'Missing Hugging Face API key. Set HUGGINGFACE_API_KEY or HUGGINGFACEHUB_API_TOKEN.'
  }
}

export const DEFAULT_LLM_PROVIDER = normalizeModelProvider(process.env.LLM_PROVIDER, 'openai')
export const DEFAULT_EMBEDDING_PROVIDER = normalizeModelProvider(
  process.env.EMBEDDING_PROVIDER ?? process.env.LLM_PROVIDER,
  DEFAULT_LLM_PROVIDER
)

export type ProviderUsage = 'llm' | 'embedding' | 'both'

function readEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]
    if (value && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

export function getProviderApiKey(provider: ModelProvider): string | undefined {
  const config = PROVIDER_KEY_CONFIG[provider]
  return readEnv(config.envKeys)
}

export function requireProviderApiKey(provider: ModelProvider): string {
  const apiKey = getProviderApiKey(provider)
  if (!apiKey) {
    throw new Error(PROVIDER_KEY_CONFIG[provider]?.missingMessage ?? 'Missing provider API key.')
  }
  return apiKey
}

export function getLlmModelName(provider: ModelProvider, explicit?: string | null): string {
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim()
  }

  switch (provider) {
    case 'openai':
      return (
        process.env.OPENAI_MODEL ??
        process.env.LLM_MODEL ??
        DEFAULT_LLM_MODELS.openai
      )
    case 'gemini':
      return (
        process.env.GOOGLE_LLM_MODEL ??
        process.env.LLM_MODEL ??
        DEFAULT_LLM_MODELS.gemini
      )
    case 'huggingface':
      return (
        process.env.HUGGINGFACE_LLM_MODEL ??
        process.env.LLM_MODEL ??
        DEFAULT_LLM_MODELS.huggingface
      )
    default:
      return DEFAULT_LLM_MODELS[provider]
  }
}

export function getEmbeddingModelName(
  provider: ModelProvider,
  explicit?: string | null
): string {
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim()
  }

  switch (provider) {
    case 'openai':
      return (
        process.env.OPENAI_EMBEDDING_MODEL ??
        process.env.EMBEDDING_MODEL ??
        DEFAULT_EMBEDDING_MODELS.openai
      )
    case 'gemini':
      return (
        process.env.GOOGLE_EMBEDDING_MODEL ??
        process.env.EMBEDDING_MODEL ??
        DEFAULT_EMBEDDING_MODELS.gemini
      )
    case 'huggingface':
      return (
        process.env.HUGGINGFACE_EMBEDDING_MODEL ??
        process.env.EMBEDDING_MODEL ??
        DEFAULT_EMBEDDING_MODELS.huggingface
      )
    default:
      return DEFAULT_EMBEDDING_MODELS[provider]
  }
}

export function normalizeLlmProvider(
  provider: string | null | undefined
): ModelProvider {
  return normalizeModelProvider(provider, DEFAULT_LLM_PROVIDER)
}

export function normalizeEmbeddingProvider(
  provider: string | null | undefined
): ModelProvider {
  return normalizeModelProvider(provider, DEFAULT_EMBEDDING_PROVIDER)
}

export function getProviderDefaults(): {
  defaultLlmProvider: ModelProvider
  defaultEmbeddingProvider: ModelProvider
} {
  return {
    defaultLlmProvider: DEFAULT_LLM_PROVIDER,
    defaultEmbeddingProvider: DEFAULT_EMBEDDING_PROVIDER
  }
}

export function getDefaultModelNames(): {
  llm: Record<ModelProvider, string>
  embedding: Record<ModelProvider, string>
} {
  return {
    llm: { ...DEFAULT_LLM_MODELS },
    embedding: { ...DEFAULT_EMBEDDING_MODELS }
  }
}
