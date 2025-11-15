import { type ModelProvider, normalizeModelProvider } from '@/lib/shared/model-provider'

import {
  resolveEmbeddingSpace
} from './embedding-spaces'
import {
  resolveLlmModel
} from './llm-registry'

type ProviderKeyConfig = {
  envKeys: string[]
  missingMessage: string
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
  ollama: {
    envKeys: [],
    missingMessage: 'Ollama runs locally and does not require an API key.'
  }
}

export const DEFAULT_LLM_PROVIDER = resolveLlmModel().provider
export const DEFAULT_EMBEDDING_PROVIDER = resolveEmbeddingSpace().provider

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
  const resolved = resolveLlmModel({
    provider,
    modelId: explicit ?? undefined,
    model: explicit ?? undefined
  })
  return resolved.model
}

export function getEmbeddingModelName(
  provider: ModelProvider,
  explicit?: string | null
): string {
  const resolved = resolveEmbeddingSpace({
    provider,
    embeddingModelId: explicit ?? undefined,
    model: explicit ?? undefined
  })
  return resolved.model
}

export function normalizeLlmProvider(
  provider: string | null | undefined
): ModelProvider {
  const fallback = resolveLlmModel({ provider }).provider
  return normalizeModelProvider(provider, fallback)
}

export function normalizeEmbeddingProvider(
  provider: string | null | undefined
): ModelProvider {
  const fallback = resolveEmbeddingSpace({ provider }).provider
  return normalizeModelProvider(provider, fallback)
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

export {
  DEFAULT_EMBEDDING_MODEL_ID,
  DEFAULT_EMBEDDING_SPACE_ID,
  listEmbeddingModelOptions,
  resolveEmbeddingSpace
} from './embedding-spaces'
export {
  DEFAULT_LLM_MODEL_ID,
  listLlmModelOptions,
  resolveLlmModel
} from './llm-registry'
