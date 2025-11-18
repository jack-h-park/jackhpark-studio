import {
  type EmbeddingModelSelectionInput,
  resolveEmbeddingSpace,
} from '@/lib/core/embedding-spaces'
import {
  getLcChunksViewName,
  getMatchChunksFunctionName,
  getMatchLcChunksFunctionName,
  getRagChunksTableName,
} from '@/lib/shared/models'

type Selection = EmbeddingModelSelectionInput | string | null | undefined

function resolveSelection(selection?: Selection) {
  return resolveEmbeddingSpace(
    typeof selection === 'string'
      ? {
          embeddingSpaceId: selection,
          embeddingModelId: selection,
          provider: selection,
          model: selection,
        }
      : selection,
  )
}

export function getRagChunksTable(selection?: Selection): string {
  const resolved = resolveSelection(selection)
  return getRagChunksTableName(resolved.embeddingSpaceId)
}

export function getLcChunksView(selection?: Selection): string {
  const resolved = resolveSelection(selection)
  return getLcChunksViewName(resolved.embeddingSpaceId)
}

export function getRagMatchFunction(selection?: Selection): string {
  const resolved = resolveSelection(selection)
  return getMatchChunksFunctionName(resolved.embeddingSpaceId)
}

export function getLcMatchFunction(selection?: Selection): string {
  const resolved = resolveSelection(selection)
  return getMatchLcChunksFunctionName(resolved.embeddingSpaceId)
}
