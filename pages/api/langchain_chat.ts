// pages/api/langchain_chat.ts
import type { NextApiRequest, NextApiResponse } from 'next'

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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY as string
const SUPABASE_URL = process.env.SUPABASE_URL as string
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const LLM_MODEL = process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
const RAG_TOP_K = Number(process.env.RAG_TOP_K || 5)
const LLM_TEMPERATURE = Number(process.env.LLM_TEMPERATURE || 0)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing')
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase server env is missing')

    const { question } =
      (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {}
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question is required' })
    }

    // Lazy import to reduce cold start
    const [
      { createClient },
      { OpenAIEmbeddings, ChatOpenAI },
      { SupabaseVectorStore },
      { PromptTemplate },
      { RunnableSequence },
      { StringOutputParser }
    ] = await Promise.all([
      import('@supabase/supabase-js'),
      import('@langchain/openai'),
      import('@langchain/community/vectorstores/supabase'),
      import('@langchain/core/prompts'),
      import('@langchain/core/runnables'),
      import('@langchain/core/output_parsers')
    ])

    // --- Initialize clients
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const embeddings = new OpenAIEmbeddings({ model: EMBEDDING_MODEL })
    const store = new SupabaseVectorStore(embeddings, {
      client: supabase,
      tableName: 'lc_chunks',      // view you created
      queryName: 'match_lc_chunks' // RPC you created
    })
    const retriever = store.asRetriever({ k: RAG_TOP_K })

    // --- English prompt
    const prompt = PromptTemplate.fromTemplate(`
    You are Jack's personal site assistant. Answer concisely using **only** the user's public materials provided in the context.
- If the answer is not in the context, say "I don't know."
- Respond in English within 5 concise sentences.

Question:
{question}

Relevant excerpts:
{context}
    `)

    const llm = new ChatOpenAI({
      model: LLM_MODEL,
      temperature: LLM_TEMPERATURE
    })

    // --- Chain: Retrieve → Build Context → Prompt → LLM → Parse → Attach citations
    const chain = RunnableSequence.from([
      async (input: { question: string }) => {
        const docs = await retriever._getRelevantDocuments(input.question)
        const context = docs
          .map((d) => `- ${d.pageContent}`.slice(0, 800))
          .join('\n')
        return { ...input, context, _docs: docs }
      },
      prompt,
      llm,
      new StringOutputParser(),
      async (answer: string, prev: any): Promise<AskResult> => {
        const docs = prev?._docs || []
        const citations: Citation[] = docs.slice(0, 3).map((d: any) => ({
          doc_id: d?.metadata?.doc_id,
          title: d?.metadata?.title ?? d?.metadata?.document_meta?.title,
          source_url: d?.metadata?.source_url
        }))
        return { answer, citations }
      }
    ])

    const result = await chain.invoke({ question })
    return res.status(200).json(result)
  } catch (err: any) {
    console.error('[api/langchain_chat] error:', err)
    return res
      .status(500)
      .json({ error: err?.message || 'Internal Server Error' })
  }
}