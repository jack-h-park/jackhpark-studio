import { type ModelProvider, normalizeModelProvider } from '@/lib/shared/model-provider'

export type EmbeddingSpaceId = 'openai_te3s_v1' | 'gemini_te4_v1'
export type EmbeddingSpace = {
  embeddingSpaceId: EmbeddingSpaceId
  provider: ModelProvider
  model: string
  version: string
  label: string
  embeddingModelId: string
  table: string
  matchRpc: string
  lcView: string
  lcMatchRpc: string
  aliases: string[]
}

export type EmbeddingModelSelectionInput = {
  embeddingSpaceId?: string | null
  embeddingModelId?: string | null
  provider?: string | null
  model?: string | null
}

const EMBEDDING_SPACES: Record<EmbeddingSpaceId, EmbeddingSpace> = {
  openai_te3s_v1: {
    embeddingSpaceId: 'openai_te3s_v1',
    provider: 'openai',
    model: 'text-embedding-3-small',
    version: 'v1',
    label: 'OpenAI text-embedding-3-small (v1)',
    embeddingModelId: 'OpenAI text-embedding-3-small (v1)',
    table: 'rag_chunks_openai_te3s_v1',
    matchRpc: 'match_chunks_openai_te3s_v1',
    lcView: 'lc_chunks_openai_te3s_v1',
    lcMatchRpc: 'match_lc_chunks_openai_te3s_v1',
    aliases: [
      'openai text-embedding-3-small',
      'text-embedding-3-small',
      'openai_te3s_v1',
      'rag_chunks_openai',
      'rag_chunks_openai_te3s_v1',
      'match_chunks_openai',
      'match_rag_chunks_openai',
      'openai'
    ]
  },
  gemini_te4_v1: {
    embeddingSpaceId: 'gemini_te4_v1',
    provider: 'gemini',
    model: 'text-embedding-004',
    version: 'v1',
    label: 'Gemini text-embedding-004 (v1)',
    embeddingModelId: 'Gemini text-embedding-004 (v1)',
    table: 'rag_chunks_gemini_te4_v1',
    matchRpc: 'match_chunks_gemini_te4_v1',
    lcView: 'lc_chunks_gemini_te4_v1',
    lcMatchRpc: 'match_lc_chunks_gemini_te4_v1',
    aliases: [
      'gemini text-embedding-004',
      'text-embedding-004',
      'gemini_te4_v1',
      'rag_chunks_gemini',
      'rag_chunks_gemini_te4_v1',
      'match_chunks_gemini',
      'match_rag_chunks_gemini',
      'google',
      'gemini'
    ]
  }
}

const EMBEDDING_ALIAS_LOOKUP = new Map<string, EmbeddingSpace>()
for (const space of Object.values(EMBEDDING_SPACES)) {
  const keys = new Set<string>([
    space.embeddingSpaceId,
    space.embeddingModelId,
    space.label,
    space.model,
    ...space.aliases
  ])
  for (const key of keys) {
    EMBEDDING_ALIAS_LOOKUP.set(key.toLowerCase(), space)
  }
}

const DEFAULT_EMBEDDING_SPACE_ID =
  process.env.EMBEDDING_SPACE_ID?.trim() && process.env.EMBEDDING_SPACE_ID.trim().length > 0
    ? (process.env.EMBEDDING_SPACE_ID.trim() as EmbeddingSpaceId)
    : 'openai_te3s_v1'

const DEFAULT_EMBEDDING_MODEL_ID =
  process.env.EMBEDDING_MODEL?.trim() && process.env.EMBEDDING_MODEL.trim().length > 0
    ? process.env.EMBEDDING_MODEL.trim()
    : EMBEDDING_SPACES[DEFAULT_EMBEDDING_SPACE_ID].embeddingModelId

function findById(id: string | null | undefined): EmbeddingSpace | null {
  if (!id) return null
  const normalized = id.toLowerCase().trim()
  return EMBEDDING_ALIAS_LOOKUP.get(normalized) ?? null
}

function findByProvider(provider: string | null | undefined): EmbeddingSpace | null {
  if (!provider) return null
  const normalized = normalizeModelProvider(provider)
  const entry = Object.values(EMBEDDING_SPACES).find((space) => space.provider === normalized)
  return entry ?? null
}

export function resolveEmbeddingSpace(
  input?: EmbeddingModelSelectionInput | string | null
): EmbeddingSpace {
  const candidate: EmbeddingModelSelectionInput =
    typeof input === 'string'
      ? { embeddingModelId: input, embeddingSpaceId: input, provider: input, model: input }
      : input ?? {}

  const byExplicit =
    findById(candidate.embeddingSpaceId) ??
    findById(candidate.embeddingModelId) ??
    findById(candidate.model)
  if (byExplicit) {
    return byExplicit
  }

  const byProvider = findByProvider(candidate.provider)
  if (byProvider) {
    return byProvider
  }

  const envModel =
    findById(process.env.EMBEDDING_MODEL ?? null) ??
    findById(process.env.NEXT_PUBLIC_EMBEDDING_MODEL ?? null)
  if (envModel) {
    return envModel
  }

  const envProvider = findByProvider(process.env.EMBEDDING_PROVIDER ?? process.env.LLM_PROVIDER)
  if (envProvider) {
    return envProvider
  }

  const fromDefault = findById(DEFAULT_EMBEDDING_SPACE_ID)
  if (fromDefault) {
    return fromDefault
  }

  return Object.values(EMBEDDING_SPACES)[0]!
}

export function listEmbeddingModelOptions(): EmbeddingSpace[] {
  return Object.values(EMBEDDING_SPACES)
}

export function findEmbeddingSpace(value: string | null | undefined): EmbeddingSpace | null {
  if (!value) {
    return null
  }
  const normalized = value.toLowerCase().trim()
  return EMBEDDING_ALIAS_LOOKUP.get(normalized) ?? null
}

export { DEFAULT_EMBEDDING_MODEL_ID, DEFAULT_EMBEDDING_SPACE_ID }
