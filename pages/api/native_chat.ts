import { type NextApiRequest, type NextApiResponse } from 'next'

import { resolveEmbeddingSpace } from '@/lib/core/embedding-spaces'
import { embedText } from '@/lib/core/embeddings'
import { getGeminiModelCandidates, shouldRetryGeminiModel } from '@/lib/core/gemini'
import { findLlmModelOption, resolveLlmModel } from '@/lib/core/llm-registry'
import { requireProviderApiKey } from '@/lib/core/model-provider'
import { isOllamaEnabled } from '@/lib/core/ollama'
import { getOpenAIClient } from '@/lib/core/openai'
import { getRagMatchFunction } from '@/lib/core/rag-tables'
import { getAppEnv, langfuse } from '@/lib/langfuse'
import {
  applyHistoryWindow,
  buildContextWindow,
  buildIntentContextFallback,
  type ContextWindowResult,
  estimateTokens,
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
import {
  applyRanker,
  generateHydeDocument,
  rewriteQuery
} from '@/lib/server/rag-enhancements'
import { logDebugRag } from '@/lib/server/rag-logger'
import { resolveRagUrl } from '@/lib/server/rag-url-resolver'
import {
  type GuardrailEnhancements,
  type GuardrailMeta,
  serializeGuardrailMeta
} from '@/lib/shared/guardrail-meta'
import {
  type ModelProvider,
  toModelProviderId
} from '@/lib/shared/model-provider'
import {
  DEFAULT_HYDE_ENABLED,
  DEFAULT_RANKER_MODE,
  DEFAULT_REVERSE_RAG_ENABLED,
  DEFAULT_REVERSE_RAG_MODE,
  parseBooleanFlag,
  parseRankerMode,
  parseReverseRagMode
} from '@/lib/shared/rag-config'
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
  reverseRagEnabled?: unknown
  reverseRagMode?: unknown
  hydeEnabled?: unknown
  rankerMode?: unknown
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
    const reverseRagEnabled = parseBooleanFlag(
      body.reverseRagEnabled ?? first(req.query.reverseRagEnabled),
      DEFAULT_REVERSE_RAG_ENABLED
    )
    const reverseRagMode = parseReverseRagMode(
      body.reverseRagMode ?? first(req.query.reverseRagMode),
      DEFAULT_REVERSE_RAG_MODE
    )
    const hydeEnabled = parseBooleanFlag(
      body.hydeEnabled ?? first(req.query.hydeEnabled),
      DEFAULT_HYDE_ENABLED
    )
    const rankerMode = parseRankerMode(
      body.rankerMode ?? first(req.query.rankerMode),
      DEFAULT_RANKER_MODE
    )

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
    const env = getAppEnv()
    const sessionId =
      (req.headers['x-chat-id'] as string) ??
      (req.headers['x-request-id'] as string) ??
      normalizedQuestion.normalized
    const userId =
      typeof req.headers['x-user-id'] === 'string'
        ? req.headers['x-user-id']
        : undefined
    const trace = langfuse.trace({
      name: 'native-chat-turn',
      sessionId,
      userId,
      input: normalizedQuestion.normalized,
      metadata: {
        env,
        provider,
        model: llmModel,
        embeddingProvider,
        embeddingModel,
        config: {
          reverseRagEnabled,
          reverseRagMode,
          hydeEnabled,
          rankerMode
        }
      }
    })
    const temperature = parseNumber(
      body.temperature ?? first(req.query.temperature),
      DEFAULT_TEMPERATURE
    )
    const maxTokens = Math.max(
      16,
      parseNumber(body.maxTokens ?? first(req.query.maxTokens), DEFAULT_MAX_TOKENS)
    )
    const enhancements: GuardrailEnhancements = {
      reverseRag: {
        enabled: reverseRagEnabled,
        mode: reverseRagMode,
        original: normalizedQuestion.normalized,
        rewritten: normalizedQuestion.normalized
      },
      hyde: {
        enabled: hydeEnabled,
        generated: null
      },
      ranker: {
        mode: rankerMode
      }
    }

    console.log('[native_chat] guardrails', {
      intent: routingDecision.intent,
      reason: routingDecision.reason,
      historyTokens: historyWindow.tokenCount,
      summaryApplied: Boolean(historyWindow.summaryMemory),
      provider,
      embeddingProvider,
      llmModel,
      embeddingModel,
      embeddingSpaceId: embeddingSelection.embeddingSpaceId,
      reverseRagEnabled,
      reverseRagMode,
      hydeEnabled,
      rankerMode
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
      const reversedQuery = await rewriteQuery(normalizedQuestion.normalized, {
        enabled: reverseRagEnabled,
        mode: reverseRagMode,
        provider,
        model: llmModel
      })
      enhancements.reverseRag = {
        enabled: reverseRagEnabled,
        mode: reverseRagMode,
        original: normalizedQuestion.normalized,
        rewritten: reversedQuery
      }
      if (trace && reverseRagEnabled) {
        void trace.observation({
          name: 'reverse_rag',
          input: normalizedQuestion.normalized,
          output: reversedQuery,
          metadata: {
            env,
            provider,
            model: llmModel,
            mode: reverseRagMode,
            stage: 'reverse-rag',
            type: 'reverse_rag'
          }
        })
      }
      logDebugRag('reverse-query', {
        enabled: reverseRagEnabled,
        mode: reverseRagMode,
        original: normalizedQuestion.normalized,
        rewritten: reversedQuery
      })
      const hydeDocument = await generateHydeDocument(reversedQuery, {
        enabled: hydeEnabled,
        provider,
        model: llmModel
      })
      enhancements.hyde = {
        enabled: hydeEnabled,
        generated: hydeDocument ?? null
      }
      if (trace) {
        void trace.observation({
          name: 'hyde',
          input: reversedQuery,
          output: hydeDocument,
          metadata: {
            env,
            provider,
            model: llmModel,
            enabled: hydeEnabled,
            stage: 'hyde'
          }
        })
      }
      logDebugRag('hyde', {
        enabled: hydeEnabled,
        generated: hydeDocument
      })
      const embeddingInput = hydeDocument ?? reversedQuery
      const embedding = await embedText(embeddingInput, {
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
      const matchCount = Math.max(DEFAULT_MATCH_COUNT, guardrails.ragTopK * 2)
      logDebugRag('retrieval', {
        query: embeddingInput,
        matchCount,
        similarityThreshold: guardrails.similarityThreshold
      })
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
      if (trace) {
        void trace.observation({
          name: 'retrieval',
          input: embeddingInput,
          output: normalizedDocuments,
          metadata: {
            env,
            provider,
            model: llmModel,
            source: 'supabase',
            stage: 'retrieval',
            results: normalizedDocuments.length
          }
        })
      }
      const rankedDocuments = await applyRanker(normalizedDocuments, {
        mode: rankerMode,
        maxResults: Math.max(guardrails.ragTopK, 1),
        embeddingSelection,
        queryEmbedding: embedding
      })
      if (trace) {
        void trace.observation({
          name: 'reranker',
          input: normalizedDocuments,
          output: rankedDocuments,
          metadata: {
            env,
            provider,
            model: llmModel,
            mode: rankerMode,
            stage: 'reranker',
            results: rankedDocuments.length
          }
        })
      }
      contextResult = buildContextWindow(rankedDocuments, guardrails)
      console.log('[native_chat] context compression', {
        retrieved: normalizedDocuments.length,
        ranked: rankedDocuments.length,
        included: contextResult.included.length,
        dropped: contextResult.dropped,
        totalTokens: contextResult.totalTokens,
        highestScore: Number(contextResult.highestScore.toFixed(3)),
        insufficient: contextResult.insufficient,
        rankerMode
      })
    } else {
      contextResult = buildIntentContextFallback(routingDecision.intent, guardrails)
      console.log('[native_chat] intent fallback', {
        intent: routingDecision.intent
      })
    }

    const summaryTokens =
      historyWindow.summaryMemory && historyWindow.summaryMemory.length > 0
        ? estimateTokens(historyWindow.summaryMemory)
        : null
    const summaryInfo =
      summaryTokens !== null
        ? {
            originalTokens: historyWindow.tokenCount,
            summaryTokens,
            trimmedTurns: historyWindow.trimmed.length,
            maxTurns: guardrails.summary.maxTurns
          }
        : undefined

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
          : undefined,
        contextTokenBudget: guardrails.ragContextTokenBudget,
        contextClipTokens: guardrails.ragContextClipTokens
      },
      summaryConfig: {
        enabled: guardrails.summary.enabled,
        triggerTokens: guardrails.summary.triggerTokens,
        maxTurns: guardrails.summary.maxTurns,
        maxChars: guardrails.summary.maxChars
      },
      summaryInfo,
      enhancements
    }
    res.setHeader('Content-Encoding', 'identity')
    res.setHeader(
      'X-Guardrail-Meta',
      encodeURIComponent(serializeGuardrailMeta(responseMeta))
    )

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
    if (trace) {
      void trace.observation({
        name: 'generation',
        input: {
          systemPrompt,
          context: contextResult.contextBlock
        },
        metadata: {
          env,
          provider,
          model: llmModel,
          temperature,
          maxTokens,
          stage: 'generation'
        }
      })
    }

    const stream = streamChatCompletion({
      provider,
      model: llmModel,
      temperature,
      maxTokens,
      systemPrompt,
      messages,
      stream: true
    })
    let finalOutput = ''
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
        finalOutput += chunk
        res.write(chunk)
      }
      ensureStreamHeaders()
      res.end()
      if (trace) {
        void trace.update({
          output: finalOutput
        })
      }
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

function _buildPlainPrompt(systemPrompt: string, messages: ChatMessage[]): string {
  const parts: string[] = [`System:\n${systemPrompt.trim()}`]

  for (const message of messages) {
    const label = message.role === 'assistant' ? 'Assistant' : 'User'
    parts.push(`${label}:\n${message.content}`)
  }

  parts.push('Assistant:\n')
  return parts.join('\n\n')
}
