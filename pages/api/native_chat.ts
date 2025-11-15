import { type NextApiRequest, type NextApiResponse } from 'next'

import { resolveEmbeddingSpace } from '@/lib/core/embedding-spaces'
import { embedText } from '@/lib/core/embeddings'
import { getGeminiModelCandidates, shouldRetryGeminiModel } from '@/lib/core/gemini'
import { findLlmModelOption, resolveLlmModel } from '@/lib/core/llm-registry'
import { requireProviderApiKey } from '@/lib/core/model-provider'
import { isOllamaEnabled } from '@/lib/core/ollama'
import { getOpenAIClient } from '@/lib/core/openai'
import { getRagMatchFunction } from '@/lib/core/rag-tables'
import {
  applyHistoryWindow,
  buildContextWindow,
  buildIntentContextFallback,
  type ContextWindowResult,
  getChatGuardrailConfig,
  normalizeQuestion,
  routeQuestion
} from '@/lib/server/chat-guardrails'
import {
  type ChatMessage,
  sanitizeMessages
} from '@/lib/server/chat-messages'
import { loadSystemPrompt } from '@/lib/server/chat-settings'
import {
  respondWithOllamaUnavailable,
  respondWithUnsupportedOllamaModel
} from '@/lib/server/ollama-errors'
import {
  OllamaUnavailableError,
  streamOllamaChat
} from '@/lib/server/ollama-provider'
import {
  type CanonicalPageLookup,
  loadCanonicalPageLookup
} from '@/lib/server/page-url'
import { resolveRagUrl } from '@/lib/server/rag-url-resolver'
import {
  type GuardrailMeta,
  serializeGuardrailMeta
} from '@/lib/shared/guardrail-meta'
import {
  type ModelProvider,
  toModelProviderId
} from '@/lib/shared/model-provider'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type RagDocumentMetadata = {
  doc_id?: string | null
  docId?: string | null
  page_id?: string | null
  pageId?: string | null
  title?: string | null
  source_url?: string | null
  sourceUrl?: string | null
  url?: string | null
  chunk_hash?: string | null
  ingested_at?: string | null
  [key: string]: unknown
}

type RagDocument = {
  id?: string | null
  doc_id?: string | null
  docId?: string | null
  document_id?: string | null
  documentId?: string | null
  content?: string | null
  embedding?: number[] | null
  similarity?: number | null
  source_url?: string | null
  sourceUrl?: string | null
  url?: string | null
  metadata?: RagDocumentMetadata | null
  [key: string]: unknown
}

type ChatRequestBody = {
  messages?: unknown
  provider?: unknown
  embeddingProvider?: unknown
  model?: unknown
  embeddingModel?: unknown
  embeddingSpaceId?: unknown
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

    const guardrails = await getChatGuardrailConfig()

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
    const routingDecision = routeQuestion(normalizedQuestion, messages, guardrails)

    const requestedProvider = first(body.provider) ?? first(req.query.provider)
    const requestedEmbeddingProvider =
      first(body.embeddingProvider) ?? first(req.query.embeddingProvider)
    const requestedLlmModel = first(body.model) ?? first(req.query.model)
    const requestedEmbeddingModel =
      first(body.embeddingModel) ?? first(req.query.embeddingModel)
    const requestedEmbeddingSpace =
      first((body as any)?.embeddingSpaceId) ?? first(req.query.embeddingSpaceId)

    const requestedProviderId = toModelProviderId(requestedProvider)
    const requestedModelOption = requestedLlmModel
      ? findLlmModelOption(requestedLlmModel)
      : null
    const inferredOllamaByValue = Boolean(
      typeof requestedLlmModel === 'string' &&
        requestedLlmModel.toLowerCase().includes('ollama')
    )
    const isOllamaRequested =
      requestedProviderId === 'ollama' ||
      requestedModelOption?.provider === 'ollama' ||
      inferredOllamaByValue

    if (
      (requestedProviderId === 'ollama' || inferredOllamaByValue) &&
      typeof requestedLlmModel === 'string' &&
      (!requestedModelOption || requestedModelOption.provider !== 'ollama')
    ) {
      return respondWithUnsupportedOllamaModel(res, requestedLlmModel)
    }

    if (isOllamaRequested && !isOllamaEnabled()) {
      return respondWithOllamaUnavailable(res)
    }

    const llmSelection = resolveLlmModel({
      provider: requestedProvider,
      modelId: requestedLlmModel,
      model: requestedLlmModel
    })
    const embeddingSelection = resolveEmbeddingSpace({
      provider: requestedEmbeddingProvider ?? llmSelection.provider,
      embeddingModelId: requestedEmbeddingModel,
      embeddingSpaceId: requestedEmbeddingSpace,
      model: requestedEmbeddingModel
    })

    const provider = llmSelection.provider
    const embeddingProvider = embeddingSelection.provider
    const llmModel = llmSelection.model
    const embeddingModel = embeddingSelection.model
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
      embeddingModel,
      embeddingSpaceId: embeddingSelection.embeddingSpaceId
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
        provider: embeddingSelection.provider,
        model: embeddingSelection.model,
        embeddingModelId: embeddingSelection.embeddingModelId,
        embeddingSpaceId: embeddingSelection.embeddingSpaceId
      })

      if (!embedding || embedding.length === 0) {
        throw new Error('Failed to generate an embedding for the query.')
      }

      const supabase = getSupabaseAdminClient()
      const ragMatchFunction = getRagMatchFunction(embeddingSelection)
      const matchCount = Math.max(
        DEFAULT_MATCH_COUNT,
        guardrails.ragTopK * 2
      )
      const { data: documents, error: matchError } = await supabase.rpc(
        ragMatchFunction,
        {
          query_embedding: embedding,
          similarity_threshold: guardrails.similarityThreshold,
          match_count: matchCount
        }
      )

      if (matchError) {
        console.error('Error matching documents:', matchError)
        return res.status(500).json({
          error: `Error matching documents: ${matchError.message}`
        })
      }

      const typedDocuments: RagDocument[] = Array.isArray(documents)
        ? (documents as RagDocument[])
        : []
      const canonicalLookup = await loadCanonicalPageLookup()
      const normalizedDocuments = applyPublicPageUrls(
        typedDocuments,
        canonicalLookup
      )
      contextResult = buildContextWindow(normalizedDocuments, guardrails)
      console.log('[native_chat] context compression', {
        retrieved: normalizedDocuments.length,
        included: contextResult.included.length,
        dropped: contextResult.dropped,
        totalTokens: contextResult.totalTokens,
        highestScore: Number(contextResult.highestScore.toFixed(3)),
        insufficient: contextResult.insufficient
      })
    } else {
      contextResult = buildIntentContextFallback(routingDecision.intent, guardrails)
      console.log('[native_chat] intent fallback', {
        intent: routingDecision.intent
      })
    }

    const responseMeta: GuardrailMeta = {
      intent: routingDecision.intent,
      reason: routingDecision.reason,
      historyTokens: historyWindow.tokenCount,
      summaryApplied: Boolean(historyWindow.summaryMemory),
      history: {
        tokens: historyWindow.tokenCount,
        budget: guardrails.historyTokenBudget,
        trimmedTurns: historyWindow.trimmed.length,
        preservedTurns: historyWindow.preserved.length
      },
      context: {
        included: contextResult.included.length,
        dropped: contextResult.dropped,
        totalTokens: contextResult.totalTokens,
        insufficient: contextResult.insufficient,
        retrieved: contextResult.included.length + contextResult.dropped,
        similarityThreshold: guardrails.similarityThreshold,
        highestSimilarity: Number.isFinite(contextResult.highestScore)
          ? contextResult.highestScore
          : undefined
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

    const stream = streamChatCompletion({
      provider,
      model: llmModel,
      temperature,
      maxTokens,
      systemPrompt,
      messages,
      stream: true
    })
    let streamHeadersSent = false
    const ensureStreamHeaders = () => {
      if (!streamHeadersSent) {
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked'
        })
        streamHeadersSent = true
      }
    }

    try {
      for await (const chunk of stream) {
        if (!chunk || res.writableEnded) {
          continue
        }
        ensureStreamHeaders()
        res.write(chunk)
      }
      ensureStreamHeaders()
      res.end()
    } catch (streamErr) {
      if (!streamHeadersSent) {
        if (streamErr instanceof OllamaUnavailableError) {
          return respondWithOllamaUnavailable(res)
        }
        throw streamErr
      }
      throw streamErr
    }
  } catch (err: any) {
    console.error('Chat API error:', err)
    const errorMessage = err?.message || 'An unexpected error occurred'
    if (!res.headersSent) {
      if (err instanceof OllamaUnavailableError) {
        return respondWithOllamaUnavailable(res)
      }
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

function applyPublicPageUrls(
  documents: RagDocument[],
  canonicalLookup: CanonicalPageLookup
): RagDocument[] {
  if (!documents?.length) {
    return documents
  }

  return documents.map((doc: RagDocument, index) => {
    const { docId, sourceUrl } = resolveRagUrl({
      docIdCandidates: [
        doc.doc_id,
        doc.docId,
        doc.document_id,
        doc.documentId,
        doc.id,
        doc.metadata?.doc_id,
        doc.metadata?.docId,
        doc.metadata?.page_id,
        doc.metadata?.pageId
      ],
      sourceUrlCandidates: [
        doc.source_url,
        doc.sourceUrl,
        doc.metadata?.source_url,
        doc.metadata?.sourceUrl,
        doc.metadata?.url,
        doc.url
      ],
      canonicalLookup,
      debugLabel: 'native_chat:url',
      index
    })

    if (sourceUrl) {
      doc.source_url = sourceUrl
      doc.metadata = {
        ...doc.metadata,
        doc_id: docId ?? doc.metadata?.doc_id ?? null,
        source_url: sourceUrl
      }
    }

    if (docId && typeof doc.doc_id !== 'string') {
      doc.doc_id = docId
    }

    return doc
  })
}

type ChatStreamOptions = {
  provider: ModelProvider
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  messages: ChatMessage[]
  stream?: boolean
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
    case 'ollama':
      yield* streamOllamaChat(options)
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
