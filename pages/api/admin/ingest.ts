import type { NextApiRequest, NextApiResponse } from 'next'
import { parsePageId } from 'notion-utils'

import {
  type ManualIngestionEvent,
  type ManualIngestionRequest,
  runManualIngestion
} from '@/lib/admin/manual-ingestor'

type ManualIngestionBody = {
  mode?: unknown
  pageId?: unknown
  url?: unknown
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

    return { mode: 'notion_page', pageId: parsed }
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

    return { mode: 'url', url: parsed.toString() }
  }

  throw new Error('Unsupported ingestion mode.')
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  let request: ManualIngestionRequest
  try {
    request = validateBody(req.body ?? {})
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid payload.'
    res.status(400).json({ error: message })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  let closed = false
  req.on('close', () => {
    closed = true
  })

  const send = async (event: ManualIngestionEvent) => {
    if (closed) return
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  try {
    await runManualIngestion(request, send)
  } catch {
    // Error handling logic remains the same
  } finally {
    if (!closed) {
      res.end()
    }
  }
}