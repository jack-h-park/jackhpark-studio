import { type NextRequest, NextResponse } from 'next/server'
import { parsePageId } from 'notion-utils'

import {
  type ManualIngestionEvent,
  type ManualIngestionRequest,
  runManualIngestion
} from '../../../lib/admin/manual-ingestor'

type ManualIngestionBody = {
  mode?: unknown
  pageId?: unknown
  url?: unknown
  ingestionType?: unknown
}

function validateBody(body: ManualIngestionBody): ManualIngestionRequest {
  if (body.mode === 'notion_page') {
    if (typeof body.pageId !== 'string') {
      throw new Error('Missing Notion page ID.')
    }

    const parsed = parsePageId(body.pageId, { uuid: true })
    if (!parsed) {
      throw new Error('Invalid Notion page ID.')
    }

    const ingestionType = body.ingestionType === 'full' ? 'full' : 'partial'

    return { mode: 'notion_page', pageId: parsed, ingestionType }
  }

  if (body.mode === 'url') {
    if (typeof body.url !== 'string') {
      throw new Error('Missing URL.')
    }

    const trimmed = body.url.trim()
    let parsed: URL

    try {
      parsed = new URL(trimmed)
    } catch {
      throw new Error('Invalid URL.')
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS URLs are supported.')
    }

    const ingestionType = body.ingestionType === 'full' ? 'full' : 'partial'

    return {
      mode: 'url',
      url: parsed.toString(),
      ingestionType
    }
  }

  throw new Error('Unsupported ingestion mode.')
}

// Edge 런타임으로 변경
export const config = {
  runtime: 'edge'
}

export default async function handler(req: NextRequest): Promise<NextResponse> {
  if (req.method !== 'POST') {
    return new NextResponse('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST' }
    })
  }

  let request: ManualIngestionRequest
  try {
    const body = await req.json()
    request = validateBody(body ?? {})
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid payload.'
    return new NextResponse(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ManualIngestionEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\\n\\n`))
      }

      try {
        await runManualIngestion(request, send)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unexpected error.'
        send({
          type: 'log',
          level: 'error',
          message: `Manual ingestion aborted: ${message}`
        })
        send({
          type: 'complete',
          status: 'failed',
          message: `Manual ingestion failed: ${message}`,
          runId: null,
          stats: { documentsProcessed: 0, documentsAdded: 0, documentsUpdated: 0, documentsSkipped: 0, chunksAdded: 0, chunksUpdated: 0, charactersAdded: 0, charactersUpdated: 0, errorCount: 1 }
        })
      } finally {
        controller.close()
      }
    }
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  })
}
