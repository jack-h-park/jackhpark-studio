// pages/api/langchain_chat.ts
import type { Document } from '@langchain/core/documents'
import type { EmbeddingsInterface } from '@langchain/core/embeddings'
import type { BaseLanguageModelInterface } from '@langchain/core/language_models/base'
import type { NextApiRequest, NextApiResponse } from 'next'

import { type EmbeddingSpace, resolveEmbeddingSpace } from '@/lib/core/embedding-spaces'
import { getGeminiModelCandidates, shouldRetryGeminiModel } from '@/lib/core/gemini'
import { findLlmModelOption, resolveLlmModel } from '@/lib/core/llm-registry'
import {
  requireProviderApiKey
} from '@/lib/core/model-provider'
import { getOllamaRuntimeConfig, isOllamaEnabled } from '@/lib/core/ollama'
import { getLcChunksView, getLcMatchFunction } from '@/lib/core/rag-tables'
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
import { OllamaUnavailableError } from '@/lib/server/ollama-provider'
import {
  type CanonicalPageLookup,
  loadCanonicalPageLookup} from '@/lib/server/page-url'
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
import { getAppEnv, langfuse } from '@/lib/langfuse'

/**
 * Pages Router API (Node.js runtime).
 * Use Node (not Edge) for LangChain + Supabase clients.
 */
export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' }
  }
}

type Citation = {
  doc_id?: string
  title?: string
  source_url?: string
  excerpt_count?: number
}
type ChatRequestBody = {
  question?: unknown
  messages?: unknown
  provider?: unknown
  embeddingProvider?: unknown
  model?: unknown
  embeddingModel?: unknown
  embeddingSpaceId?: unknown
  temperature?: unknown
  reverseRagEnabled?: unknown
  reverseRagMode?: unknown
  hydeEnabled?: unknown
  rankerMode?: unknown
}

const CITATIONS_SEPARATOR = `\n\n--- begin citations ---\n`
const DEBUG_LANGCHAIN_STREAM =
  (process.env.DEBUG_LANGCHAIN_STREAM ?? "").toLowerCase() === "true"

const DEBUG_LANGCHAIN_SEGMENT_SIZE = 60

function splitIntoSegments(value: string, size: number): string[] {
  if (!value || size <= 0) {
    return [value]
  }
  const segments: string[] = []
  for (let index = 0; index < value.length; index += size) {
    segments.push(value.slice(index, index + size))
  }
  return segments
}

function formatChunkPreview(value: string) {
  // eslint-disable-next-line unicorn/prefer-string-replace-all
  const collapsed = value.replace(/\s+/g, " ").trim()
  if (collapsed.length <= 60) {
    return collapsed
  }
  return `${collapsed.slice(0, 60)}…`
}

const SUPABASE_URL = process.env.SUPABASE_URL as string
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const RAG_TOP_K = Number(process.env.RAG_TOP_K || 5)
const DEFAULT_TEMPERATURE = Number(process.env.LLM_TEMPERATURE ?? 0)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase server env is missing')
    }

    const body: ChatRequestBody =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}

    const guardrails = await getChatGuardrailConfig()
    const fallbackQuestion =
      typeof body.question === 'string' ? body.question : undefined
    let rawMessages: ChatMessage[] = []
    if (Array.isArray(body.messages)) {
      rawMessages = sanitizeMessages(body.messages)
    } else if (fallbackQuestion) {
      rawMessages = [{ role: 'user', content: fallbackQuestion }]
    }
    const historyWindow = applyHistoryWindow(rawMessages, guardrails)
    const messages = historyWindow.preserved
    const lastMessage = messages.at(-1)

    if (!lastMessage) {
      return res.status(400).json({ error: 'question is required' })
    }

    const question = lastMessage.content
    const normalizedQuestion = normalizeQuestion(question)
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
      first(body.embeddingSpaceId) ?? first(req.query.embeddingSpaceId)

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
      embeddingSpaceId: requestedEmbeddingSpace ?? requestedEmbeddingModel,
      model: requestedEmbeddingModel
    })

    const provider = llmSelection.provider
    const embeddingProvider = embeddingSelection.provider
    const llmModel = llmSelection.model
    const embeddingModel = embeddingSelection.model
    const temperature = parseTemperature(
      body.temperature ?? first(req.query.temperature)
    )
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
      name: 'langchain-chat-turn',
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

    const [
      { createClient },
      { SupabaseVectorStore },
      { PromptTemplate }
    ] = await Promise.all([
      import('@supabase/supabase-js'),
      import('@langchain/community/vectorstores/supabase'),
      import('@langchain/core/prompts'),
    ])

    const embeddings = await createEmbeddingsInstance(embeddingSelection)
    console.log('[langchain_chat] guardrails', {
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { prompt: basePrompt } = await loadSystemPrompt()
    const promptTemplate = [
      escapeForPromptTemplate(basePrompt),
      '',
      'Guardrails:',
      '{intent}',
      '',
      'Conversation summary:',
      '{memory}',
      '',
      'Question:',
      '{question}',
      '',
      'Relevant excerpts:',
      '{context}'
    ].join('\n')
    const prompt = PromptTemplate.fromTemplate(promptTemplate)

    let latestMeta: GuardrailMeta | null = null
    let enhancementSummary: GuardrailEnhancements = {
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

    const executeWithResources = async (
      tableName: string,
      queryName: string,
      llmInstance: BaseLanguageModelInterface
    ): Promise<{ stream: AsyncIterable<string>; citations: Citation[] }> => {
      let contextResult: ContextWindowResult = buildIntentContextFallback(
        routingDecision.intent,
        guardrails
      )

      if (routingDecision.intent === 'knowledge') {
        const rewrittenQuery = await rewriteQuery(normalizedQuestion.normalized, {
          enabled: reverseRagEnabled,
          mode: reverseRagMode,
          provider,
          model: llmModel
        })
        if (trace && reverseRagEnabled) {
          void trace.observation({
            name: 'reverse_rag',
            input: normalizedQuestion.normalized,
            output: rewrittenQuery,
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
          rewritten: rewrittenQuery
        })
        const hydeDocument = await generateHydeDocument(rewrittenQuery, {
          enabled: hydeEnabled,
          provider,
          model: llmModel
        })
        enhancementSummary = {
          reverseRag: {
            enabled: reverseRagEnabled,
            mode: reverseRagMode,
            original: normalizedQuestion.normalized,
            rewritten: rewrittenQuery
          },
          hyde: {
            enabled: hydeEnabled,
            generated: hydeDocument ?? null
          },
          ranker: {
            mode: rankerMode
          }
        }
        if (trace) {
          void trace.observation({
            name: 'hyde',
            input: rewrittenQuery,
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
        const embeddingTarget = hydeDocument ?? rewrittenQuery
        logDebugRag('retrieval', {
          query: embeddingTarget,
          mode: rankerMode
        })
        const queryEmbedding = await embeddings.embedQuery(embeddingTarget)
        const matchCount = Math.max(RAG_TOP_K, guardrails.ragTopK * 2)
        const store = new SupabaseVectorStore(embeddings, {
          client: supabase,
          tableName,
          queryName
        })
        const matches = await store.similaritySearchVectorWithScore(
          queryEmbedding,
          matchCount
        )
        const canonicalLookup = await loadCanonicalPageLookup()
        const normalizedMatches = matches.map(([doc, score], index) => {
          const rewrittenDoc = rewriteLangchainDocument(
            doc,
            canonicalLookup,
            index
          )
          return [rewrittenDoc, score] as typeof matches[number]
        })
        const ragDocs = normalizedMatches.map(([doc, score]) => ({
          chunk: doc.pageContent,
          metadata: doc.metadata,
          similarity:
            typeof score === 'number'
              ? score
              : typeof doc?.metadata?.similarity === 'number'
                ? (doc.metadata.similarity as number)
                : undefined
        }))
        if (trace) {
          void trace.observation({
            name: 'retrieval',
            input: embeddingTarget,
            output: ragDocs,
            metadata: {
              env,
              provider,
              model: llmModel,
              stage: 'retrieval',
              source: 'supabase',
              results: ragDocs.length
            }
          })
        }
        const rankedDocs = await applyRanker(ragDocs, {
          mode: rankerMode,
          maxResults: Math.max(guardrails.ragTopK, 1),
          embeddingSelection,
          queryEmbedding
        })
        if (trace) {
          void trace.observation({
            name: 'reranker',
            input: ragDocs,
            output: rankedDocs,
            metadata: {
              env,
              provider,
              model: llmModel,
              mode: rankerMode,
              stage: 'reranker',
              results: rankedDocs.length
            }
          })
        }
        contextResult = buildContextWindow(rankedDocs, guardrails)
        console.log('[langchain_chat] context compression', {
          retrieved: normalizedMatches.length,
          ranked: rankedDocs.length,
          included: contextResult.included.length,
          dropped: contextResult.dropped,
          totalTokens: contextResult.totalTokens,
          highestScore: Number(contextResult.highestScore.toFixed(3)),
          insufficient: contextResult.insufficient,
          rankerMode
        })
      } else {
        console.log('[langchain_chat] intent fallback', {
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

      latestMeta = {
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
        enhancements: enhancementSummary,
        summaryConfig: {
          enabled: guardrails.summary.enabled,
          triggerTokens: guardrails.summary.triggerTokens,
          maxTurns: guardrails.summary.maxTurns,
          maxChars: guardrails.summary.maxChars
        }
        ,
        summaryInfo
      }

      const guardrailMeta = [
        `Intent: ${routingDecision.intent} (${routingDecision.reason})`,
        contextResult.insufficient
          ? 'Context status: insufficient matches. Be explicit when information is missing.'
          : `Context status: ${contextResult.included.length} excerpts (${contextResult.totalTokens} tokens).`
      ].join(' | ')
      const contextValue =
        contextResult.contextBlock.length > 0
          ? contextResult.contextBlock
          : '(No relevant context was found.)'
      const memoryValue =
        historyWindow.summaryMemory ??
        '(No summarized prior turns. Treat this as a standalone exchange.)'

      const promptInput = await prompt.format({
        question,
        context: contextValue,
        memory: memoryValue,
        intent: guardrailMeta
      })
      if (trace) {
        void trace.observation({
          name: 'generation',
          input: {
            prompt: promptInput,
            context: contextValue
          },
          metadata: {
            env,
            provider,
            model: llmModel,
            temperature,
            stage: 'generation'
          }
        })
      }
      const stream = await llmInstance.stream(promptInput)
      const citationMap = new Map<
        string,
        {
          doc_id?: string
          title?: string
          source_url?: string
          excerpt_count: number
        }
      >()
      const includedDocs = contextResult.included as any[]
      let index = 0
      for (const doc of includedDocs) {
        const docId =
          doc?.metadata?.doc_id ??
          doc?.metadata?.docId ??
          doc?.metadata?.page_id ??
          doc?.metadata?.pageId ??
          undefined
        const sourceUrl =
          doc?.metadata?.source_url ??
          doc?.metadata?.sourceUrl ??
          undefined
        const normalizedUrl = sourceUrl ? sourceUrl.trim().toLowerCase() : ''
        const key =
          normalizedUrl.length > 0
            ? normalizedUrl
            : docId
              ? `doc:${docId}`
              : `idx:${index}`
        const title =
          doc?.metadata?.title ?? doc?.metadata?.document_meta?.title ?? undefined

        const existing = citationMap.get(key)
        if (existing) {
          existing.excerpt_count += 1
        } else {
          citationMap.set(key, {
            doc_id: docId,
            title,
            source_url: sourceUrl,
            excerpt_count: 1
          })
        }
        index += 1
      }

      const citations: Citation[] = Array.from(citationMap.values())

      return { stream, citations }
    }

    const primaryTable = getLcChunksView(embeddingSelection)
    const primaryFunction = getLcMatchFunction(embeddingSelection)

    const modelCandidates =
      provider === 'gemini'
        ? getGeminiModelCandidates(llmModel)
        : [llmModel]
    let lastGeminiError: unknown

    for (let index = 0; index < modelCandidates.length; index++) {
      const candidate = modelCandidates[index]
      const nextModel = modelCandidates[index + 1]
      const llm = await createChatModel(provider, candidate, temperature)

      try {
        const { stream, citations } = await executeWithResources(
          primaryTable,
          primaryFunction,
          llm
        )
        res.setHeader('Content-Encoding', 'identity')
        if (latestMeta) {
          res.setHeader(
            'X-Guardrail-Meta',
            encodeURIComponent(serializeGuardrailMeta(latestMeta))
          )
        }
        if (candidate !== llmModel) {
          console.warn(
            `[langchain_chat] Gemini model "${candidate}" succeeded after falling back from "${llmModel}".`
          )
        }

        let streamHeadersSent = false
        let finalOutput = ''
        let chunkIndex = 0
        const ensureStreamHeaders = () => {
          if (!streamHeadersSent) {
            res.writeHead(200, {
              'Content-Type': 'text/plain; charset=utf-8',
              'Transfer-Encoding': 'chunked'
            })
            streamHeadersSent = true
          }
        }

        const delayBetweenChunks = DEBUG_LANGCHAIN_STREAM ? 75 : 0
        const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

        try {
          for await (const chunk of stream) {
            const rendered = renderStreamChunk(chunk)
            if (!rendered || res.writableEnded) {
              continue
            }
            const segments = DEBUG_LANGCHAIN_STREAM
              ? splitIntoSegments(rendered, DEBUG_LANGCHAIN_SEGMENT_SIZE)
              : [rendered]

            for (const segment of segments) {
              if (!segment || res.writableEnded) {
                continue
              }
              chunkIndex += 1
              if (DEBUG_LANGCHAIN_STREAM) {
                const preview =
                  segment.length > 0 ? formatChunkPreview(segment) : '<empty>'
                console.debug(
                  `[langchain_chat] chunk ${chunkIndex} (${segment.length} chars): ${preview}`
                )
              }
              ensureStreamHeaders()
              finalOutput += segment
              res.write(segment)
              if (delayBetweenChunks > 0) {
                await wait(delayBetweenChunks)
              }
            }
          }

          ensureStreamHeaders()
          if (DEBUG_LANGCHAIN_STREAM) {
            console.debug(
              `[langchain_chat] stream completed after ${chunkIndex} chunk(s)`
            )
          }
          const citationJson = JSON.stringify(citations)
          if (!res.writableEnded) {
            res.write(`${CITATIONS_SEPARATOR}${citationJson}`)
          }
          if (trace) {
            void trace.update({
              output: finalOutput
            })
          }
          return res.end()
        } catch (streamErr) {
          if (!streamHeadersSent) {
            if (streamErr instanceof OllamaUnavailableError) {
              return respondWithOllamaUnavailable(res)
            }
            throw streamErr
          }
          throw streamErr
        }
      } catch (err) {
        lastGeminiError = err
        const shouldRetry =
          provider === 'gemini' &&
          Boolean(nextModel) &&
          shouldRetryGeminiModel(candidate, err)

        if (!shouldRetry) {
          throw err
        }

        console.warn(
          `[langchain_chat] Gemini model "${candidate}" failed (${err instanceof Error ? err.message : String(err)}). Falling back to "${nextModel}".`
        )
      }
    }

    if (lastGeminiError) {
      throw lastGeminiError
    }

    throw new Error('Failed to initialize Gemini model.')
  } catch (err: any) {
    console.error('[api/langchain_chat] error:', err)
    if (err instanceof OllamaUnavailableError) {
      return respondWithOllamaUnavailable(res)
    }
    return res
      .status(500)
      .json({ error: err?.message || 'Internal Server Error' })
  }
}

function first(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined
  }
  return typeof value === 'string' ? value : undefined
}

function parseTemperature(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_TEMPERATURE
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : DEFAULT_TEMPERATURE
}

function renderStreamChunk(chunk: unknown): string | null {
  if (!chunk) {
    return null
  }

  if (typeof chunk === 'string') {
    return chunk
  }

  if (typeof chunk === 'object') {
    const candidate = chunk as { content?: unknown; text?: unknown }
    if (typeof candidate.text === 'string') {
      return candidate.text
    }
    if (typeof candidate.content === 'string') {
      return candidate.content
    }
    if (Array.isArray(candidate.content)) {
      const joined = candidate.content
        .map((entry) => {
          if (typeof entry === 'string') {
            return entry
          }
          if (entry && typeof entry === 'object' && 'text' in entry) {
            const value = (entry as { text?: unknown }).text
            return typeof value === 'string' ? value : ''
          }
          return ''
        })
        .join('')
      return joined.length > 0 ? joined : null
    }
  }

  return null
}

function rewriteLangchainDocument(
  doc: Document,
  canonicalLookup: CanonicalPageLookup,
  index: number
): Document {
  const meta = doc.metadata ?? {}
  const { docId, sourceUrl } = resolveRagUrl({
    docIdCandidates: [
      meta.doc_id,
      meta.docId,
      meta.page_id,
      meta.pageId,
      meta.document_id,
      meta.documentId
    ],
    sourceUrlCandidates: [meta.source_url, meta.sourceUrl, meta.url],
    canonicalLookup,
    debugLabel: 'langchain_chat:url',
    index
  })

  if (sourceUrl) {
    doc.metadata = {
      ...meta,
      doc_id: docId ?? meta.doc_id ?? null,
      source_url: sourceUrl
    }
  }

  return doc
}

function escapeForPromptTemplate(value: string): string {
  return value.replaceAll('{', '{{').replaceAll('}', '}}')
}

async function createEmbeddingsInstance(
  selection: EmbeddingSpace
): Promise<EmbeddingsInterface> {
  switch (selection.provider) {
    case 'openai': {
      const { OpenAIEmbeddings } = await import('@langchain/openai')
      const apiKey = requireProviderApiKey('openai')
      return new OpenAIEmbeddings({
        model: selection.model,
        apiKey
      })
    }
    case 'gemini': {
      const { GoogleGenerativeAIEmbeddings } = await import(
        '@langchain/google-genai'
      )
      const apiKey = requireProviderApiKey('gemini')
      return new GoogleGenerativeAIEmbeddings({
        model: selection.model,
        apiKey
      })
    }
    default:
      throw new Error(`Unsupported embedding provider: ${selection.provider}`)
  }
}

async function createChatModel(
  provider: ModelProvider,
  modelName: string,
  temperature: number
): Promise<BaseLanguageModelInterface> {
  switch (provider) {
    case 'openai': {
      const { ChatOpenAI } = await import('@langchain/openai')
      const apiKey = requireProviderApiKey('openai')
      return new ChatOpenAI({
        model: modelName,
        apiKey,
        temperature,
        streaming: true
      })
    }
    case 'gemini': {
      const { ChatGoogleGenerativeAI } = await import(
        '@langchain/google-genai'
      )
      const apiKey = requireProviderApiKey('gemini')
      return new ChatGoogleGenerativeAI({
        model: modelName,
        apiKey,
        temperature,
        streaming: true
      })
    }
    case 'ollama': {
      const { ChatOllama } = await import(
        '@langchain/community/chat_models/ollama'
      )
      const config = getOllamaRuntimeConfig()
      if (!config.enabled || !config.baseUrl) {
        throw new OllamaUnavailableError(
          'Ollama provider is disabled in this environment.'
        )
      }
      return new ChatOllama({
        baseUrl: config.baseUrl,
        model: modelName ?? config.defaultModel,
        temperature
      }) as unknown as BaseLanguageModelInterface
    }
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`)
  }
}
