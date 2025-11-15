export type GuardrailMetaContext = {
  included: number
  dropped: number
  totalTokens: number
  insufficient: boolean
  retrieved?: number
  similarityThreshold?: number
  highestSimilarity?: number
}

export type GuardrailMetaHistory = {
  tokens: number
  budget: number
  trimmedTurns: number
  preservedTurns: number
}

export type GuardrailMeta = {
  intent: string
  reason: string
  historyTokens: number
  summaryApplied: boolean
  history?: GuardrailMetaHistory
  context: GuardrailMetaContext
}

export function serializeGuardrailMeta(meta: GuardrailMeta): string {
  return JSON.stringify(meta)
}

export function deserializeGuardrailMeta(value: string | null | undefined): GuardrailMeta | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as GuardrailMeta
  } catch {
    try {
      return JSON.parse(decodeURIComponent(value)) as GuardrailMeta
    } catch {
      return null
    }
  }
}
