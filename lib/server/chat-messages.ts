export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export function sanitizeMessages(raw: unknown[]): ChatMessage[] {
  const result: ChatMessage[] = []

  for (const entry of raw) {
    if (
      entry &&
      typeof entry === 'object' &&
      'role' in entry &&
      'content' in entry &&
      (entry as any).role !== 'system'
    ) {
      const role = (entry as any).role
      const content = (entry as any).content
      if (
        (role === 'user' || role === 'assistant') &&
        typeof content === 'string' &&
        content.trim().length > 0
      ) {
        result.push({ role, content: content.trim() })
      }
    }
  }

  return result
}
