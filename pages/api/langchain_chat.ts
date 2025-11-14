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
  type GuardrailMeta,
  serializeGuardrailMeta
} from '@/lib/shared/guardrail-meta'
import { host } from '@/lib/config'
import {
  loadCanonicalPageLookup,
  resolvePublicPageUrl,
  normalizePageId,
  type CanonicalPageLookup
} from '@/lib/server/page-url'

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
const DEBUG_RAG_URLS =
  (process.env.DEBUG_RAG_URLS ?? '').toLowerCase() === 'true'

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
      const citations: Citation[] = contextResult.included
        .slice(0, 3)
        .map((doc: any) => ({
          doc_id: doc?.metadata?.doc_id,
          title: doc?.metadata?.title ?? doc?.metadata?.document_meta?.title,
          source_url: doc?.metadata?.source_url
        }))

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
  const docId = getNormalizedDocId(doc)
  const canonicalUrl =
    docId !== null ? resolvePublicPageUrl(docId, canonicalLookup) : null
  const sourceUrl = getDocumentSourceUrl(doc)
  const rewrittenSource =
    canonicalUrl ?? rewriteNotionUrl(sourceUrl, docId) ?? sourceUrl ?? null

  if (DEBUG_RAG_URLS) {
    console.log('[langchain_chat:url]', {
      index,
      docId,
      sourceUrl,
      canonicalUrl,
      rewrittenSource
    })
  }

  if (rewrittenSource) {
    doc.metadata = {
      ...(doc.metadata ?? {}),
      doc_id: docId ?? doc.metadata?.doc_id ?? null,
      source_url: rewrittenSource
    }
  }

  return doc
}

function getNormalizedDocId(doc: Document): string | null {
  const meta = doc.metadata ?? {}
  const candidates = [
    meta.doc_id,
    meta.docId,
    meta.page_id,
    meta.pageId,
    meta.document_id,
    meta.documentId
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue
    }
    const normalized = normalizePageId(candidate)
    if (normalized) {
      return normalized
    }
  }

  return null
}

function getDocumentSourceUrl(doc: Document): string | null {
  const meta = doc.metadata ?? {}
  const candidates = [meta.source_url, meta.sourceUrl, meta.url]

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
  }

  return null
}

function rewriteNotionUrl(
  sourceUrl: string | null,
  docId: string | null
): string | null {
  const baseHost = host.replace(/\/+$/, '')

  if (!sourceUrl) {
    return docId ? `${baseHost}/${docId}` : null
  }

  const normalizedUrl = ensureAbsoluteUrl(sourceUrl)
  let parsed: URL

  try {
    parsed = new URL(normalizedUrl)
  } catch {
    return normalizedUrl
  }

  const hostname = parsed.hostname.toLowerCase()
  const derivedDocId =
    docId ??
    normalizePageId(parsed.pathname.split('/').filter(Boolean).at(-1) ?? null)

  if (
    derivedDocId &&
    (hostname.includes('notion.so') || hostname.includes('notion.site'))
  ) {
    const rewritten = `${baseHost}/${derivedDocId}`
    if (DEBUG_RAG_URLS) {
      console.log('[langchain_chat:url:fallback]', {
        sourceUrl,
        derivedDocId,
        rewritten
      })
    }
    return rewritten
  }

  return normalizedUrl
}

function ensureAbsoluteUrl(url: string): string {
  if (!url) {
    return url
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  return `https://${url.replace(/^\/+/, '')}`
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
