import { type NextApiRequest, type NextApiResponse } from 'next'

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
    const systemPrompt = `You are a very enthusiastic personal assistant for Jack H. Park.
    You are helping a user who is visiting Jack's personal website.
    Your name is "Jack's AI Assistant".
    You are friendly and helpful.
    You will be given a question and a context.
    The context is a series of excerpts from Jack's personal Notion pages.
    You should use the provided context to answer the question.
    If the context does not contain the answer, say "I'm sorry, but I don't have enough information to answer that question. You can find more about Jack on his LinkedIn or GitHub." and do not add any more information.
    Do not mention that you are using a context.
    Answer in the same language as the question.
    Be concise and helpful.
    Here is the context:
    ${contextText}`.trim()

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