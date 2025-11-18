import {
  type ModelProvider,
  normalizeModelProvider,
} from "@/lib/shared/model-provider";
import {
  EMBEDDING_MODEL_DEFINITIONS,
  type EmbeddingModelId,
  type EmbeddingSpaceId,
} from "@/lib/shared/models";

type EmbeddingSpace = {
  embeddingSpaceId: EmbeddingSpaceId
  provider: ModelProvider
  model: EmbeddingModelId
  version: string
  label: string
  embeddingModelId: string
  table: string
  matchRpc: string
  lcView: string
  lcMatchRpc: string
  aliases: readonly string[]
}

export type EmbeddingModelSelectionInput = {
  embeddingSpaceId?: string | null
  embeddingModelId?: string | null
  provider?: string | null
  model?: string | null
}

const EMBEDDING_SPACES: Record<EmbeddingSpaceId, EmbeddingSpace> =
  EMBEDDING_MODEL_DEFINITIONS.reduce<Record<EmbeddingSpaceId, EmbeddingSpace>>(
    (acc, definition) => {
      acc[definition.embeddingSpaceId] = {
        embeddingSpaceId: definition.embeddingSpaceId,
        provider: definition.provider,
        model: definition.model,
        version: definition.version,
        label: definition.label,
      embeddingModelId: definition.embeddingModelId,
      table: definition.table,
      matchRpc: definition.matchRpc,
      lcView: definition.lcView,
      lcMatchRpc: definition.lcMatchRpc,
      aliases: definition.aliases,
    }
    return acc
  },
    {} as Record<EmbeddingSpaceId, EmbeddingSpace>,
  )

const EMBEDDING_ALIAS_LOOKUP = new Map<string, EmbeddingSpace>()
for (const space of Object.values(EMBEDDING_SPACES)) {
  const keys = new Set<string>([
    space.embeddingSpaceId,
    space.embeddingModelId,
    space.label,
    space.model,
    ...space.aliases,
  ])
  for (const key of keys) {
    EMBEDDING_ALIAS_LOOKUP.set(key.toLowerCase(), space)
  }
}

const DEFAULT_SPACE_FALLBACK =
  EMBEDDING_MODEL_DEFINITIONS[0]?.embeddingSpaceId ??
  (Object.keys(EMBEDDING_SPACES)[0] as EmbeddingSpaceId)

const DEFAULT_EMBEDDING_SPACE_ID =
  process.env.EMBEDDING_SPACE_ID?.trim() &&
  process.env.EMBEDDING_SPACE_ID.trim().length > 0
    ? (process.env.EMBEDDING_SPACE_ID.trim() as EmbeddingSpaceId)
    : DEFAULT_SPACE_FALLBACK

const DEFAULT_EMBEDDING_MODEL_ID =
  process.env.EMBEDDING_MODEL?.trim() &&
  process.env.EMBEDDING_MODEL.trim().length > 0
    ? process.env.EMBEDDING_MODEL.trim()
    : EMBEDDING_MODEL_DEFINITIONS[0]?.model ?? ''

function findById(id: string | null | undefined): EmbeddingSpace | null {
  if (!id) return null
  const normalized = id.toLowerCase().trim()
  return EMBEDDING_ALIAS_LOOKUP.get(normalized) ?? null
}

function findByProvider(
  provider: string | null | undefined,
): EmbeddingSpace | null {
  if (!provider) return null
  const normalized = normalizeModelProvider(provider)
  return (
    Object.values(EMBEDDING_SPACES).find((space) => space.provider === normalized) ??
    null
  )
}

export function resolveEmbeddingSpace(
  input?: EmbeddingModelSelectionInput | string | null,
): EmbeddingSpace {
  const candidate =
    typeof input === 'string'
      ? { embeddingSpaceId: input, embeddingModelId: input, provider: input, model: input }
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

  const envProvider = findByProvider(
    process.env.EMBEDDING_PROVIDER ?? process.env.LLM_PROVIDER,
  )
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

export function findEmbeddingSpace(
  value: string | null | undefined,
): EmbeddingSpace | null {
  if (!value) {
    return null
  }
  const normalized = value.toLowerCase().trim()
  return EMBEDDING_ALIAS_LOOKUP.get(normalized) ?? null
}

export type { EmbeddingSpace }
export { DEFAULT_EMBEDDING_MODEL_ID, DEFAULT_EMBEDDING_SPACE_ID }
export type {
  EmbeddingModelId,
  EmbeddingSpaceId,
} from '@/lib/shared/models'
