import { type NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

import { getSupabaseAdminClient } from '../../lib/supabase-admin'

export const config = {
  runtime: 'edge'
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OpenAI API key')
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export default async function handler(req: NextRequest) {
  if (req.method !== 'POST') {
    return new NextResponse('Method Not Allowed', { status: 405 })
  }

  try {
    const { messages } = (await req.json()) as { messages: any[] }
    const lastMessage = messages.at(-1)
    const userQuery = lastMessage.content

    if (!userQuery) {
      return new NextResponse('Bad Request: Missing user query', { status: 400 })
    }

    // 1. 사용자의 질문을 임베딩으로 변환합니다.
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: userQuery
    })
    const embedding = embeddingResponse.data[0].embedding

    // 2. Supabase에서 관련 문서를 검색합니다. (pgvector의 match_documents 함수 사용)
    // 사용자가 제공한 match_rag_chunks 함수를 사용하도록 수정합니다.
    const supabase = getSupabaseAdminClient()
    const { data: documents, error: matchError } = await supabase.rpc(
      'match_rag_chunks',
      {
        query_embedding: embedding,
        similarity_threshold: 0.75, // 유사도 임계값 (조정 가능)
        match_count: 5, // 가져올 청크 수 (조정 가능)
      }
    )

    if (matchError) {
      console.error('Error matching documents:', matchError)
      return new NextResponse(
        `Error matching documents: ${matchError.message}`,
        { status: 500 }
      )
    }

    const contextText = documents
      .map((doc: any) => doc.chunk) // 'content' 컬럼 대신 'chunk' 컬럼을 사용합니다.
      .join('\n\n---\n\n')

    // 3. OpenAI에 전달할 프롬프트를 구성합니다.
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

    // 4. 응답을 스트리밍합니다.
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const content = chunk.choices?.[0]?.delta?.content
            if (content) {
              controller.enqueue(encoder.encode(content))
            }
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      }
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    })
  } catch (err: any) {
    console.error('Chat API error:', err)
    const errorMessage = err.message || 'An unexpected error occurred'
    return new NextResponse(errorMessage, { status: 500 })
  }
}
