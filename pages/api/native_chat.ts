import { type NextApiRequest, type NextApiResponse } from 'next'

import { loadSystemPrompt } from '@/lib/server/chat-settings'

import { EMBEDDING_MODEL, openai } from '../../lib/core/openai'
import { getSupabaseAdminClient } from '../../lib/supabase-admin'

type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const { messages } = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { messages: ChatMessage[] }
    const lastMessage = messages.at(-1)

    if (!lastMessage) {
      return res.status(400).json({ error: 'Bad Request: No messages found' })
    }

    const userQuery = lastMessage.content

    if (!userQuery) {
      return res.status(400).json({ error: 'Bad Request: Missing user query' })
    }

    // 1. Convert the user's question into an embedding.
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: userQuery
    })
    const embedding = embeddingResponse.data[0].embedding

    // 2. Search for relevant documents in Supabase.
    const supabase = getSupabaseAdminClient()
    const { data: documents, error: matchError } = await supabase.rpc('match_rag_chunks', {
      query_embedding: embedding,
      similarity_threshold: 0.75,
      match_count: 5
    })

    if (matchError) {
      console.error('Error matching documents:', matchError)
      return res.status(500).json({ error: `Error matching documents: ${matchError.message}` })
    }

    const contextText = documents
      .map((doc: { chunk: string }) => doc.chunk)
      .join('\n\n---\n\n')

    // 3. Construct the prompt for OpenAI.
    const { prompt: basePrompt } = await loadSystemPrompt()
    const contextBlock =
      contextText && contextText.trim().length > 0
        ? contextText
        : '(No relevant context was found.)'
    const systemPrompt = `${basePrompt}\n\nContext:\n${contextBlock}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ]
    })

    // 4. Stream the response.
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked'
    })

    for await (const chunk of response) {
      const content = chunk.choices?.[0]?.delta?.content
      if (content) {
        res.write(content)
      }
    }
    res.end()

  } catch (err: any) {
    console.error('Chat API error:', err)
    const errorMessage = err.message || 'An unexpected error occurred'
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage })
    } else {
      res.end()
    }
  }
}
