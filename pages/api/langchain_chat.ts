// pages/api/langchain_chat.ts
import type { Document } from '@langchain/core/documents'
import type { EmbeddingsInterface } from '@langchain/core/embeddings'
import type { BaseLanguageModelInterface } from '@langchain/core/language_models/base'
import type { NextApiRequest, NextApiResponse } from 'next'

import type { ModelProvider } from '@/lib/shared/model-provider'
import { getGeminiModelCandidates, shouldRetryGeminiModel } from '@/lib/core/gemini'
import {
  getEmbeddingModelName,
  getLlmModelName,
  normalizeEmbeddingProvider,
  normalizeLlmProvider,
  requireProviderApiKey
} from '@/lib/core/model-provider'
import { getLcChunksView, getLcMatchFunction } from '@/lib/core/rag-tables'
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
  type CanonicalPageLookup,
  loadCanonicalPageLookup} from '@/lib/server/page-url'
import { resolveRagUrl } from '@/lib/server/rag-url-resolver'
import {
  type GuardrailMeta,
  serializeGuardrailMeta
} from '@/lib/shared/guardrail-meta'

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
  temperature?: unknown
}

const CITATIONS_SEPARATOR = `\n\n--- begin citations ---\n`

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
    const temperature = parseTemperature(
      body.temperature ?? first(req.query.temperature)
    )

    const [
      { createClient },
      { SupabaseVectorStore },
      { PromptTemplate },
      { RunnableSequence }
    ] = await Promise.all([
      import('@supabase/supabase-js'),
      import('@langchain/community/vectorstores/supabase'),
      import('@langchain/core/prompts'),
      import('@langchain/core/runnables')
    ])

    const embeddings = await createEmbeddingsInstance(
      embeddingProvider,
      embeddingModel
    )
    console.log('[langchain_chat] guardrails', {
      intent: routingDecision.intent,
      reason: routingDecision.reason,
      historyTokens: historyWindow.tokenCount,
      summaryApplied: Boolean(historyWindow.summaryMemory),
      provider,
      embeddingProvider,
      llmModel,
      embeddingModel
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

    const buildChain = (llmInstance: BaseLanguageModelInterface) =>
      RunnableSequence.from([prompt, llmInstance])

    let latestMeta: GuardrailMeta | null = null

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
        const matchCount = Math.max(RAG_TOP_K, guardrails.ragTopK * 2)
        const store = new SupabaseVectorStore(embeddings, {
          client: supabase,
          tableName,
          queryName
        })
        const matches = await store.similaritySearchWithScore(
          normalizedQuestion.normalized,
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
        contextResult = buildContextWindow(ragDocs, guardrails)
        console.log('[langchain_chat] context compression', {
          retrieved: normalizedMatches.length,
          included: contextResult.included.length,
          dropped: contextResult.dropped,
          totalTokens: contextResult.totalTokens,
          highestScore: Number(contextResult.highestScore.toFixed(3)),
          insufficient: contextResult.insufficient
        })
      } else {
        console.log('[langchain_chat] intent fallback', {
          intent: routingDecision.intent
        })
      }

      latestMeta = {
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

      const chain = buildChain(llmInstance)
      const stream = await chain.stream({
        question,
        context: contextValue,
        memory: memoryValue,
        intent: guardrailMeta
      })
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

    const primaryTable = getLcChunksView(embeddingProvider)
    const primaryFunction = getLcMatchFunction(embeddingProvider)

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
        if (latestMeta) {
          res.setHeader('X-Guardrail-Meta', serializeGuardrailMeta(latestMeta))
        }
        if (candidate !== llmModel) {
          console.warn(
            `[langchain_chat] Gemini model "${candidate}" succeeded after falling back from "${llmModel}".`
          )
        }

        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked'
        })

        for await (const chunk of stream) {
          const rendered = renderStreamChunk(chunk)
          if (!rendered) {
            continue
          }
          if (!res.writableEnded) res.write(rendered)
        }

        const citationJson = JSON.stringify(citations)
        if (!res.writableEnded) res.write(`${CITATIONS_SEPARATOR}${citationJson}`)
        return res.end()
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
  provider: ModelProvider,
  modelName: string
): Promise<EmbeddingsInterface> {
  switch (provider) {
    case 'openai': {
      const { OpenAIEmbeddings } = await import('@langchain/openai')
      const apiKey = requireProviderApiKey('openai')
      return new OpenAIEmbeddings({
        model: modelName,
        apiKey
      })
    }
    case 'gemini': {
      const { GoogleGenerativeAIEmbeddings } = await import(
        '@langchain/google-genai'
      )
      const apiKey = requireProviderApiKey('gemini')
      return new GoogleGenerativeAIEmbeddings({
        model: modelName,
        apiKey
      })
    }
    case 'huggingface': {
      const { HuggingFaceInferenceEmbeddings } = await import(
        '@langchain/community/embeddings/hf'
      )
      const apiKey = requireProviderApiKey('huggingface')
      return new HuggingFaceInferenceEmbeddings({
        model: modelName,
        apiKey
      })
    }
    default:
      throw new Error(`Unsupported embedding provider: ${provider}`)
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
        temperature
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
        temperature
      })
    }
    case 'huggingface': {
      const { HuggingFaceInference } = await import(
        '@langchain/community/llms/hf'
      )
      const apiKey = requireProviderApiKey('huggingface')
      return new HuggingFaceInference({
        model: modelName,
        apiKey,
        temperature
      })
    }
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`)
  }
}
