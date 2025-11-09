import pMap from 'p-map'

import type { ModelProvider } from '@/lib/shared/model-provider'
import {
  getEmbeddingModelName,
  normalizeEmbeddingProvider,
  requireProviderApiKey
} from '@/lib/core/model-provider'

import { getOpenAIClient } from './openai'

type EmbedTextsOptions = {
  provider?: string | null
  model?: string | null
  apiKey?: string | null
}

const DEFAULT_HF_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.HUGGINGFACE_EMBEDDING_CONCURRENCY ?? '2', 10)
)

async function embedOpenAi(
  texts: string[],
  model: string,
  apiKeyOverride?: string | null
): Promise<number[][]> {
  if (texts.length === 0) {
    return []
  }

  const client = getOpenAIClient(apiKeyOverride ?? undefined)
  const response = await client.embeddings.create({
    model,
    input: texts
  })

  return response.data.map((item) => item.embedding)
}

async function embedGemini(
  texts: string[],
  model: string,
  apiKeyOverride?: string | null
): Promise<number[][]> {
  if (texts.length === 0) {
    return []
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai')

  const key = apiKeyOverride ?? requireProviderApiKey('gemini')
  const client = new GoogleGenerativeAI(key)
  const generativeModel = client.getGenerativeModel({ model })

  const response = await generativeModel.batchEmbedContents({
    requests: texts.map((text) => ({
      content: { role: 'user', parts: [{ text }] }
    }))
  })

  const embeddings = response.embeddings ?? []
  return embeddings.map((item) => {
    const vector = item?.values ?? []
    return Array.from(vector)
  })
}

async function embedHuggingFace(
  texts: string[],
  model: string,
  apiKeyOverride?: string | null
): Promise<number[][]> {
  if (texts.length === 0) {
    return []
  }

  const { HfInference } = await import('@huggingface/inference')
  const key = apiKeyOverride ?? requireProviderApiKey('huggingface')
  const inference = new HfInference(key)

  const results = await pMap(
    texts,
    async (text) => {
      const output = await inference.featureExtraction({
        model,
        inputs: text
      })

      if (Array.isArray(output)) {
        if (Array.isArray(output[0])) {
          return output[0] as number[]
        }
        return output as number[]
      }
      return []
    },
    { concurrency: DEFAULT_HF_CONCURRENCY }
  )

  return results
}

async function embedWithProvider(
  provider: ModelProvider,
  texts: string[],
  model: string,
  apiKeyOverride?: string | null
): Promise<number[][]> {
  switch (provider) {
    case 'openai':
      return embedOpenAi(texts, model, apiKeyOverride)
    case 'gemini':
      return embedGemini(texts, model, apiKeyOverride)
    case 'huggingface':
      return embedHuggingFace(texts, model, apiKeyOverride)
    default:
      throw new Error(`Unsupported embedding provider: ${provider}`)
  }
}

export async function embedTexts(
  texts: string[],
  options?: EmbedTextsOptions
): Promise<number[][]> {
  const provider = normalizeEmbeddingProvider(options?.provider)
  const modelName = getEmbeddingModelName(provider, options?.model ?? null)
  const apiKey = options?.apiKey ?? null
  return embedWithProvider(provider, texts, modelName, apiKey)
}

export async function embedText(
  text: string,
  options?: EmbedTextsOptions
): Promise<number[]> {
  const [embedding] = await embedTexts([text], options)
  return embedding ?? []
}
