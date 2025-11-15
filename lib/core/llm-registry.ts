import { type ModelProvider,normalizeModelProvider } from '@/lib/shared/model-provider'

export type LlmModelOption = {
  id: string
  label: string
  provider: ModelProvider
  model: string
  aliases: string[]
}

type LlmModelInput = {
  modelId?: string | null
  provider?: string | null
  model?: string | null
}

const LLM_MODELS: LlmModelOption[] = [
  {
    id: 'openai_gpt-4o-mini',
    label: 'OpenAI gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    aliases: ['gpt-4o-mini', 'openai gpt-4o-mini', 'gpt4o-mini', 'gpt-4o_mini']
  },
  {
    id: 'openai_gpt-4o',
    label: 'OpenAI gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    aliases: ['gpt-4o', 'openai gpt-4o']
  },
  {
    id: 'gemini_1.5-flash',
    label: 'Gemini 1.5 Flash',
    provider: 'gemini',
    model: 'gemini-1.5-flash-latest',
    aliases: ['gemini-1.5-flash-latest', 'gemini-flash', 'gemini flash']
  },
  {
    id: 'gemini_1.5-pro',
    label: 'Gemini 1.5 Pro',
    provider: 'gemini',
    model: 'gemini-1.5-pro-latest',
    aliases: ['gemini-1.5-pro-latest', 'gemini-pro', 'gemini pro']
  },
  {
    id: 'hf_mixtral-8x7b-instruct',
    label: 'Hugging Face Mixtral-8x7B-Instruct',
    provider: 'huggingface',
    model: 'mistralai/Mixtral-8x7B-Instruct',
    aliases: [
      'mistralai/mixtral-8x7b-instruct',
      'mixtral-8x7b-instruct',
      'mixtral',
      'hf mixtral'
    ]
  }
]

const DEFAULT_LLM_MODEL_ID =
  process.env.LLM_MODEL?.trim() && process.env.LLM_MODEL.trim().length > 0
    ? process.env.LLM_MODEL.trim()
    : 'openai_gpt-4o-mini'

const LLM_ALIAS_LOOKUP = new Map<string, LlmModelOption>()
for (const option of LLM_MODELS) {
  const keys = new Set<string>([option.id, option.label, ...option.aliases, option.model])
  for (const key of keys) {
    LLM_ALIAS_LOOKUP.set(key.toLowerCase(), option)
  }
}

function findByProvider(provider: string | null | undefined): LlmModelOption | null {
  if (!provider) {
    return null
  }
  const normalized = normalizeModelProvider(provider)
  const match = LLM_MODELS.find((entry) => entry.provider === normalized)
  return match ?? null
}

function findById(value: string | null | undefined): LlmModelOption | null {
  if (!value) return null
  const key = value.toLowerCase().trim()
  return LLM_ALIAS_LOOKUP.get(key) ?? null
}

export function resolveLlmModel(input?: LlmModelInput | string | null): LlmModelOption {
  const candidate: LlmModelInput =
    typeof input === 'string' ? { modelId: input, provider: input, model: input } : input ?? {}

  const byId = findById(candidate.modelId) ?? findById(candidate.model)
  if (byId) {
    return byId
  }

  const byProvider = findByProvider(candidate.provider)
  if (byProvider) {
    return byProvider
  }

  const envModel = findById(process.env.LLM_MODEL ?? null)
  if (envModel) {
    return envModel
  }

  const envProviderModel = findByProvider(process.env.LLM_PROVIDER ?? null)
  if (envProviderModel) {
    return envProviderModel
  }

  return findById(DEFAULT_LLM_MODEL_ID) ?? LLM_MODELS[0]!
}

export function listLlmModelOptions(): LlmModelOption[] {
  return [...LLM_MODELS]
}

export function findLlmModelOption(value: string | null | undefined): LlmModelOption | null {
  if (!value) {
    return null
  }
  const normalized = value.toLowerCase().trim()
  return LLM_ALIAS_LOOKUP.get(normalized) ?? null
}

export { DEFAULT_LLM_MODEL_ID }
