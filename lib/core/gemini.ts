const FALLBACK_ERROR_SNIPPETS = ['not found', 'is not found', 'not supported']

const GEMINI_MODEL_FALLBACKS: Record<string, string[]> = {
  'gemini-1.5-flash-latest': ['gemini-1.5-flash-002', 'gemini-1.5-flash'],
  'gemini-1.5-flash': ['gemini-1.5-flash-002'],
  'gemini-1.5-flash-002': ['gemini-1.0-pro-latest', 'gemini-1.0-pro'],
  'gemini-1.5-pro-latest': ['gemini-1.5-pro-002', 'gemini-1.5-pro'],
  'gemini-1.5-pro': ['gemini-1.5-pro-002'],
  'gemini-1.5-pro-002': ['gemini-1.0-pro-latest', 'gemini-1.0-pro'],
  'gemini-1.0-pro-latest': ['gemini-1.0-pro'],
  'gemini-1.0-pro': ['gemini-pro'],
  'gemini-pro': []
}

export function getGeminiModelCandidates(modelName: string): string[] {
  const queue: string[] = []
  const seen = new Set<string>()

  if (typeof modelName === 'string' && modelName.trim().length > 0) {
    queue.push(modelName.trim())
  }

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || seen.has(current)) {
      continue
    }

    seen.add(current)

    const fallbacks = GEMINI_MODEL_FALLBACKS[current]
    if (fallbacks?.length) {
      for (const fallback of fallbacks) {
        if (fallback && !seen.has(fallback)) {
          queue.push(fallback)
        }
      }
    }

    if (current.endsWith('-latest')) {
      const trimmed = current.replace(/-latest$/, '')
      if (trimmed && !seen.has(trimmed)) {
        queue.push(trimmed)
      }
    }
  }

  return Array.from(seen)
}

export function shouldRetryGeminiModel(
  modelName: string,
  error: unknown
): boolean {
  const hasFallback =
    Boolean(GEMINI_MODEL_FALLBACKS[modelName]?.length) ||
    modelName?.endsWith('-latest')

  if (!hasFallback) {
    return false
  }

  const message =
    error instanceof Error ? error.message : error ? String(error) : ''

  if (!message) {
    return false
  }

  const normalized = message.toLowerCase()
  return FALLBACK_ERROR_SNIPPETS.some((snippet) =>
    normalized.includes(snippet)
  )
}
