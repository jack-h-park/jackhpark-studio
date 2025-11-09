// pages/api/langchain_chat.ts
import type { EmbeddingsInterface } from '@langchain/core/embeddings'
import type { BaseLanguageModelInterface } from '@langchain/core/language_models/base'
import type { NextApiRequest, NextApiResponse } from 'next'

import type { ModelProvider } from '@/lib/shared/model-provider'
import {
  getEmbeddingModelName,
  getLlmModelName,
  normalizeEmbeddingProvider,
  normalizeLlmProvider,
  requireProviderApiKey
} from '@/lib/core/model-provider'
import { getGeminiModelCandidates, shouldRetryGeminiModel } from '@/lib/core/gemini'
import {
  getLcChunksView,
  getLcMatchFunction,
  getLegacyLcChunksView,
  getLegacyLcMatchFunction
} from '@/lib/core/rag-tables'
import { loadSystemPrompt } from '@/lib/server/chat-settings'

/**
 * Pages Router API (Node.js runtime).
 * Use Node (not Edge) for LangChain + Supabase clients.
 */
export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' }
  }
}

type Citation = { doc_id?: string; title?: string; source_url?: string }
type AskResult = { answer: string; citations?: Citation[] }
type ChatRequestBody = {
  question?: unknown
  provider?: unknown
  embeddingProvider?: unknown
  model?: unknown
  embeddingModel?: unknown
  temperature?: unknown
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
    const question = typeof body.question === 'string' ? body.question : undefined

    if (!question) {
      return res.status(400).json({ error: 'question is required' })
    }

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
      { RunnableSequence },
      { StringOutputParser }
    ] = await Promise.all([
      import('@supabase/supabase-js'),
      import('@langchain/community/vectorstores/supabase'),
      import('@langchain/core/prompts'),
      import('@langchain/core/runnables'),
      import('@langchain/core/output_parsers')
    ])

    const embeddings = await createEmbeddingsInstance(
      embeddingProvider,
      embeddingModel
    )
    console.log(
      '[langchain_chat]',
      JSON.stringify(
        {
          provider,
          embeddingProvider,
          llmModel,
          embeddingModel
        },
        null,
        2
      )
    )

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { prompt: basePrompt } = await loadSystemPrompt()
    const promptTemplate = [
      escapeForPromptTemplate(basePrompt),
      '',
      'Question:',
      '{question}',
      '',
      'Relevant excerpts:',
      '{context}'
    ].join('\n')
    const prompt = PromptTemplate.fromTemplate(promptTemplate)

    const buildChain = (
      retriever: any,
      llmInstance: BaseLanguageModelInterface
    ) =>
      RunnableSequence.from([
        async (input: { question: string }) => {
          const docs: any[] = await retriever._getRelevantDocuments(
            input.question
          )
          const context = docs
            .map((d: any) => `- ${d.pageContent}`.slice(0, 800))
            .join('\n')
          return { ...input, context, _docs: docs }
        },
        prompt,
        llmInstance,
        new StringOutputParser(),
        async (answer: string, prev: any): Promise<AskResult> => {
          const docs: any[] = prev?._docs || []
          const citations: Citation[] = docs.slice(0, 3).map((d: any) => ({
            doc_id: d?.metadata?.doc_id,
            title: d?.metadata?.title ?? d?.metadata?.document_meta?.title,
            source_url: d?.metadata?.source_url
          }))
          return { answer, citations }
        }
      ])

    const executeWithResources = async (
      tableName: string,
      queryName: string,
      llmInstance: BaseLanguageModelInterface
    ) => {
      const store = new SupabaseVectorStore(embeddings, {
        client: supabase,
        tableName,
        queryName
      })
      const retriever = store.asRetriever({ k: RAG_TOP_K })
      const chain = buildChain(retriever, llmInstance)
      return chain.invoke({ question })
    }

    const primaryTable = getLcChunksView(embeddingProvider)
    const primaryFunction = getLcMatchFunction(embeddingProvider)
    const fallbackTable = getLegacyLcChunksView()
    const fallbackFunction = getLegacyLcMatchFunction()

    const runWithLlm = async (
      llmInstance: BaseLanguageModelInterface
    ): Promise<AskResult> => {
      try {
        return await executeWithResources(
          primaryTable,
          primaryFunction,
          llmInstance
        )
      } catch (err) {
        console.error(
          '[langchain_chat] primary match function failed',
          primaryFunction,
          err
        )
        if (shouldFallbackToLegacyResources(err, primaryFunction)) {
          console.warn(
            '[langchain_chat] falling back to legacy LC match resources',
            primaryFunction
          )
          return executeWithResources(
            fallbackTable,
            fallbackFunction,
            llmInstance
          )
        }
        throw err
      }
    }

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
        const result = await runWithLlm(llm)
        if (candidate !== llmModel) {
          console.warn(
            `[langchain_chat] Gemini model "${candidate}" succeeded after falling back from "${llmModel}".`
          )
        }
        return res.status(200).json(result)
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

function escapeForPromptTemplate(value: string): string {
  return value.replaceAll('{', '{{').replaceAll('}', '}}')
}

function shouldFallbackToLegacyResources(
  error: unknown,
  functionName: string
): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message ?? ''
  const normalized = message.toLowerCase()
  return (
    normalized.includes('could not find the function') ||
    normalized.includes('pgrst202') ||
    normalized.includes('pgrst201')
  ) && normalized.includes(functionName.toLowerCase())
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
