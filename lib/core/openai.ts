import OpenAI from 'openai'

import { requireProviderApiKey } from './model-provider'

let cachedClient: OpenAI | null = null
let cachedKey: string | null = null

export function getOpenAIClient(apiKeyOverride?: string): OpenAI {
  const key = apiKeyOverride ?? requireProviderApiKey('openai')

  if (!cachedClient || cachedKey !== key) {
    cachedClient = new OpenAI({ apiKey: key })
    cachedKey = key
  }

  return cachedClient
}

export const USER_AGENT = 'JackRAGBot/1.0'
