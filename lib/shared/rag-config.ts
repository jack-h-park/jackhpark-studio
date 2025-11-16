export type ReverseRagMode = 'precision' | 'recall'
export const REVERSE_RAG_MODES: ReverseRagMode[] = ['precision', 'recall']

export type RankerMode = 'none' | 'mmr' | 'cohere'
export const RANKER_MODES: RankerMode[] = ['none', 'mmr', 'cohere']

export type RagEnhancementConfig = {
  reverseRagEnabled: boolean
  reverseRagMode: ReverseRagMode
  hydeEnabled: boolean
  rankerMode: RankerMode
}

export const DEFAULT_REVERSE_RAG_ENABLED = false
export const DEFAULT_REVERSE_RAG_MODE: ReverseRagMode = 'precision'
export const DEFAULT_HYDE_ENABLED = false
export const DEFAULT_RANKER_MODE: RankerMode = 'none'

export function parseBooleanFlag(
  value: unknown,
  fallback: boolean
): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return fallback
}

export function parseReverseRagMode(
  value: unknown,
  fallback: ReverseRagMode
): ReverseRagMode {
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'precision') {
    return 'precision'
  }
  if (normalized === 'recall') {
    return 'recall'
  }
  return fallback
}

export function parseRankerMode(
  value: unknown,
  fallback: RankerMode
): RankerMode {
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'mmr') {
    return 'mmr'
  }
  if (normalized === 'cohere') {
    return 'cohere'
  }
  if (normalized === 'none') {
    return 'none'
  }
  return fallback
}
