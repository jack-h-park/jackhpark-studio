import {
  type EmbeddingModelSelectionInput,
  resolveEmbeddingSpace} from '@/lib/core/embedding-spaces'

type Selection = EmbeddingModelSelectionInput | string | null | undefined

function resolve(selection?: Selection) {
  return resolveEmbeddingSpace(
    typeof selection === 'string' ? { provider: selection, embeddingModelId: selection } : selection
  )
}

export function getRagChunksTable(selection?: Selection): string {
  const resolved = resolve(selection)
  return resolved.table
}

export function getLcChunksView(selection?: Selection): string {
  const resolved = resolve(selection)
  return resolved.lcView
}

export function getRagMatchFunction(selection?: Selection): string {
  const resolved = resolve(selection)
  return resolved.matchRpc
}

export function getLcMatchFunction(selection?: Selection): string {
  const resolved = resolve(selection)
  return resolved.lcMatchRpc
}
