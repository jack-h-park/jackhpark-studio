// scripts/ingest.ts
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import pMap from 'p-map'

import {
  chunkByTokens,
  type ChunkInsert,
  embedBatch,
  getDocumentState,
  hashChunk,
  replaceChunks,
  upsertDocumentState
} from './ingest-shared'

const USER_AGENT = 'JackRAGBot/1.0'
const INGEST_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.INGEST_CONCURRENCY ?? '4', 10)
)

type Article = {
  title: string
  text: string
  lastModified: string | null
}

function normalizeTimestamp(raw: string | null): string | null {
  if (!raw) {
    return null
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

async function extractMainContent(url: string): Promise<Article> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const lastModified = normalizeTimestamp(response.headers.get('last-modified'))
  const dom = new JSDOM(html, { url })

  try {
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    const title =
      article?.title?.trim() ||
      dom.window.document.title?.trim() ||
      new URL(url).hostname

    const rawText =
      article?.textContent ??
      dom.window.document.body?.textContent ??
      ''

    const text = rawText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n\n')

    return { title, text, lastModified }
  } finally {
    dom.window.close()
  }
}

async function ingestUrl(url: string): Promise<void> {
  const { title, text, lastModified } = await extractMainContent(url)

  if (!text) {
    console.warn(`No text content extracted for ${url}; skipping`)
    return
  }

  const contentHash = hashChunk(`${url}:${text}`)
  const existingState = await getDocumentState(url)
  if (
    existingState &&
    existingState.content_hash === contentHash &&
    (!lastModified || existingState.last_source_update === lastModified)
  ) {
    console.log(`Skipping unchanged URL: ${title}`)
    return
  }

  const chunks = chunkByTokens(text, 450, 75)

  if (chunks.length === 0) {
    console.warn(`Extracted content for ${url} produced no chunks; skipping`)
    return
  }

  const embeddings = await embedBatch(chunks)

  const rows: ChunkInsert[] = chunks.map((chunk, index) => ({
    doc_id: url,
    source_url: url,
    title,
    chunk,
    chunk_hash: hashChunk(`${url}:${chunk}`),
    embedding: embeddings[index]!
  }))

  await replaceChunks(url, rows)
  await upsertDocumentState({
    doc_id: url,
    source_url: url,
    content_hash: contentHash,
    last_source_update: lastModified ?? null
  })

  console.log(
    `Ingested URL: ${title} (${rows.length} chunks)${
      existingState ? ' [updated]' : ''
    }`
  )
}

async function main(): Promise<void> {
  const urls = process.argv.slice(2).filter(Boolean)

  if (urls.length === 0) {
    console.error('Usage: pnpm tsx scripts/ingest.ts <url> [url...]')
    process.exitCode = 1
    return
  }

  await pMap(
    urls,
    async (url) => {
      try {
        await ingestUrl(url)
      } catch (err) {
        console.error(`Failed to ingest ${url}`)
        console.error(err)
        process.exitCode = 1
      }
    },
    { concurrency: INGEST_CONCURRENCY }
  )
}

await main()
