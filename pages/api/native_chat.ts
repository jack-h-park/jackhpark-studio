import { type NextApiRequest, type NextApiResponse } from 'next'

import type { ModelProvider } from '@/lib/shared/model-provider'
import { embedText } from '@/lib/core/embeddings'
import { getGeminiModelCandidates, shouldRetryGeminiModel } from '@/lib/core/gemini'
import {
  getEmbeddingModelName,
  getLlmModelName,
  normalizeEmbeddingProvider,
  normalizeLlmProvider,
  requireProviderApiKey
} from '@/lib/core/model-provider'
import { getOpenAIClient } from '@/lib/core/openai'
import {
  getLegacyRagMatchFunction,
  getRagMatchFunction} from '@/lib/core/rag-tables'
import {
  applyHistoryWindow,
  buildContextWindow,
  buildIntentContextFallback,
  type ContextWindowResult,
  getChatGuardrailConfig,
  normalizeQuestion,
  routeQuestion} from '@/lib/server/chat-guardrails'
import { type ChatMessage,sanitizeMessages } from '@/lib/server/chat-messages'
import { loadSystemPrompt } from '@/lib/server/chat-settings'
import {
  type GuardrailMeta,
  serializeGuardrailMeta
} from '@/lib/shared/guardrail-meta'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type ChatRequestBody = {
  messages?: unknown
  provider?: unknown
  embeddingProvider?: unknown
  model?: unknown
  embeddingModel?: unknown
  temperature?: unknown
  maxTokens?: unknown
}

const DEFAULT_MATCH_COUNT = Number(process.env.RAG_TOP_K ?? 5)
const DEFAULT_TEMPERATURE = Number(process.env.LLM_TEMPERATURE ?? 0)
const DEFAULT_MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 512)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const body: ChatRequestBody =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}

    const guardrails = getChatGuardrailConfig()

    const rawMessages = Array.isArray(body.messages)
      ? sanitizeMessages(body.messages)
      : []
    const historyWindow = applyHistoryWindow(rawMessages, guardrails)
    const messages = historyWindow.preserved

    const lastMessage = messages.at(-1)
    if (!lastMessage) {
      return res.status(400).json({ error: 'Bad Request: No messages found' })
    }

    const userQuery = lastMessage.content?.trim()
    if (!userQuery) {
      return res
        .status(400)
        .json({ error: 'Bad Request: Missing user query content' })
    }

    const normalizedQuestion = normalizeQuestion(userQuery)
    const routingDecision = routeQuestion(normalizedQuestion, messages)

    const provider = normalizeLlmProvider(
      first(body.provider) ?? first(req.query.provider)
    )
    const embeddingProvider = normalizeEmbeddingProvider(
      first(body.embeddingProvider) ??
        first(req.query.embeddingProvider) ??
        provider
    )
    const llmModel = getLlmModelName(
      provider,
      first(body.model) ?? first(req.query.model)
    )
    const embeddingModel = getEmbeddingModelName(
      embeddingProvider,
      first(body.embeddingModel) ?? first(req.query.embeddingModel)
    )
    const temperature = parseNumber(
      body.temperature ?? first(req.query.temperature),
      DEFAULT_TEMPERATURE
    )
    const maxTokens = Math.max(
      16,
      parseNumber(body.maxTokens ?? first(req.query.maxTokens), DEFAULT_MAX_TOKENS)
    )

    console.log('[native_chat] guardrails', {
      intent: routingDecision.intent,
      reason: routingDecision.reason,
      historyTokens: historyWindow.tokenCount,
      summaryApplied: Boolean(historyWindow.summaryMemory),
      provider,
      embeddingProvider,
      llmModel,
      embeddingModel
    })

    let contextResult: ContextWindowResult = {
      contextBlock: '',
      included: [],
      dropped: 0,
      totalTokens: 0,
      insufficient: routingDecision.intent !== 'knowledge',
      highestScore: 0
    }

    if (routingDecision.intent === 'knowledge') {
      const embedding = await embedText(normalizedQuestion.normalized, {
        provider: embeddingProvider,
        model: embeddingModel
      })

      if (!embedding || embedding.length === 0) {
        throw new Error('Failed to generate an embedding for the query.')
      }

      const supabase = getSupabaseAdminClient()
      const ragMatchFunction = getRagMatchFunction(embeddingProvider)
      const matchCount = Math.max(
        DEFAULT_MATCH_COUNT,
        guardrails.ragTopK * 2
      )
      let { data: documents, error: matchError } = await supabase.rpc(
        ragMatchFunction,
        {
          query_embedding: embedding,
          similarity_threshold: guardrails.similarityThreshold,
          match_count: matchCount
        }
      )

      if (
        matchError &&
        shouldFallbackToLegacyResources(matchError, ragMatchFunction)
      ) {
        console.warn(
          '[native_chat] falling back to legacy match function',
          ragMatchFunction
        )
        const fallbackFunction = getLegacyRagMatchFunction()
        const fallback = await supabase.rpc(fallbackFunction, {
          query_embedding: embedding,
          similarity_threshold: guardrails.similarityThreshold,
          match_count: matchCount
        })

        documents = fallback.data
        matchError = fallback.error
      }

      if (matchError) {
        console.error('Error matching documents:', matchError)
        return res.status(500).json({
          error: `Error matching documents: ${matchError.message}`
        })
      }

      contextResult = buildContextWindow(documents ?? [], guardrails)
      console.log('[native_chat] context compression', {
        retrieved: documents?.length ?? 0,
        included: contextResult.included.length,
        dropped: contextResult.dropped,
        totalTokens: contextResult.totalTokens,
        highestScore: Number(contextResult.highestScore.toFixed(3)),
        insufficient: contextResult.insufficient
      })
    } else {
      contextResult = buildIntentContextFallback(routingDecision.intent)
      console.log('[native_chat] intent fallback', {
        intent: routingDecision.intent
      })
    }

    const responseMeta: GuardrailMeta = {
      intent: routingDecision.intent,
      reason: routingDecision.reason,
      historyTokens: historyWindow.tokenCount,
      summaryApplied: Boolean(historyWindow.summaryMemory),
      context: {
        included: contextResult.included.length,
        dropped: contextResult.dropped,
        totalTokens: contextResult.totalTokens,
        insufficient: contextResult.insufficient
      }
    }
    res.setHeader('X-Guardrail-Meta', serializeGuardrailMeta(responseMeta))

    const { prompt: basePrompt } = await loadSystemPrompt()
    const contextBlock =
      contextResult.contextBlock && contextResult.contextBlock.length > 0
        ? contextResult.contextBlock
        : '(No relevant context was found.)'
    const summaryBlock = historyWindow.summaryMemory
      ? `Conversation summary:\n${historyWindow.summaryMemory}`
      : null
    const contextStatus = contextResult.insufficient
      ? 'Context status: No high-confidence matches satisfied the threshold. If unsure, be explicit about the missing information.'
      : `Context status: ${contextResult.included.length} excerpts (${contextResult.totalTokens} tokens).`

    const systemPrompt = [
      basePrompt.trim(),
      '',
      `Intent: ${routingDecision.intent} (${routingDecision.reason})`,
      contextStatus,
      '',
      'Context:',
      contextBlock,
      summaryBlock ? `\n${summaryBlock}` : null
    ]
      .filter((part) => part !== null && part !== undefined)
      .join('\n')

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked'
    })

    const stream = streamChatCompletion({
      provider,
      model: llmModel,
      temperature,
      maxTokens,
      systemPrompt,
      messages
    })

    for await (const chunk of stream) {
      if (!res.writableEnded && chunk) {
        res.write(chunk)
      }
    }

    res.end()
  } catch (err: any) {
    console.error('Chat API error:', err)
    const errorMessage = err?.message || 'An unexpected error occurred'
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage })
    } else {
      res.end()
    }
  }
}

function first(value: unknown): string | undefined {
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0]
  }
  return typeof value === 'string' ? value : undefined
}

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function shouldFallbackToLegacyResources(
  error: { message?: string } | null | undefined,
  functionName: string
): boolean {
  if (!error?.message) {
    return false
  }

  const normalized = error.message.toLowerCase()
  return (
    normalized.includes('could not find the function') ||
    normalized.includes('pgrst202') ||
    normalized.includes('pgrst201')
  ) && normalized.includes(functionName.toLowerCase())
}

type ChatStreamOptions = {
  provider: ModelProvider
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  messages: ChatMessage[]
}

async function* streamChatCompletion(
  options: ChatStreamOptions
): AsyncGenerator<string> {
  switch (options.provider) {
    case 'openai':
      yield* streamOpenAI(options)
      break
    case 'gemini':
      yield* streamGemini(options)
      break
    case 'huggingface':
      yield* streamHuggingFace(options)
      break
    default:
      throw new Error(`Unsupported provider: ${options.provider}`)
  }
}

async function* streamOpenAI(options: ChatStreamOptions): AsyncGenerator<string> {
  const client = getOpenAIClient()
  const response = await client.chat.completions.create({
    model: options.model,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    stream: true,
    messages: [
      { role: 'system', content: options.systemPrompt },
      ...options.messages
    ]
  })

  for await (const chunk of response) {
    const content = chunk.choices?.[0]?.delta?.content
    if (content) {
      yield content
    }
  }
}

async function* streamGemini(options: ChatStreamOptions): AsyncGenerator<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const apiKey = requireProviderApiKey('gemini')
  const client = new GoogleGenerativeAI(apiKey)
  const contents = options.messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }]
  }))
  const modelCandidates = getGeminiModelCandidates(options.model)
  let lastError: unknown

  for (let index = 0; index < modelCandidates.length; index++) {
    const modelName = modelCandidates[index]
    const nextModelName = modelCandidates[index + 1]

    try {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: options.systemPrompt
      })
      const result = await model.generateContentStream({
        contents,
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens
        }
      })

      for await (const chunk of result.stream) {
        const text = chunk.text?.() ?? chunk.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text ?? '')
          .join('')
        if (text) {
          yield text
        }
      }

      return
    } catch (err) {
      lastError = err
      const shouldRetry =
        Boolean(nextModelName) && shouldRetryGeminiModel(modelName, err)

      if (!shouldRetry) {
        throw err
      }

      console.warn(
        `[native_chat] Gemini model "${modelName}" failed (${err instanceof Error ? err.message : String(err)}). Falling back to "${nextModelName}".`
      )
    }
  }

  if (lastError) {
    throw lastError
  }
}

async function* streamHuggingFace(
  options: ChatStreamOptions
): AsyncGenerator<string> {
  const { HfInference } = await import('@huggingface/inference')
  const apiKey = requireProviderApiKey('huggingface')
  const inference = new HfInference(apiKey)
  const prompt = buildPlainPrompt(options.systemPrompt, options.messages)

  const response = await inference.textGeneration({
    model: options.model,
    inputs: prompt,
    parameters: {
      temperature: options.temperature,
      max_new_tokens: options.maxTokens,
      return_full_text: false,
      top_p: 0.95
    }
  })

  const text =
    typeof response === 'string'
      ? response
      : response?.generated_text ?? ''

  if (text) {
    yield text
  }
}

function buildPlainPrompt(systemPrompt: string, messages: ChatMessage[]): string {
  const parts: string[] = [`System:\n${systemPrompt.trim()}`]

  for (const message of messages) {
    const label = message.role === 'assistant' ? 'Assistant' : 'User'
    parts.push(`${label}:\n${message.content}`)
  }

  parts.push('Assistant:\n')
  return parts.join('\n\n')
}
