// scripts/ingest-notion.ts
import { NotionAPI } from 'notion-client'
import { type Decoration, type ExtendedRecordMap } from 'notion-types'
import {
  getAllPagesInSpace,
  getPageContentBlockIds,
  getTextContent
} from 'notion-utils'
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

const notion = new NotionAPI()
const INGEST_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.INGEST_CONCURRENCY ?? '2', 10)
)

function extractPlainText(recordMap: ExtendedRecordMap, pageId: string): string {
  const blockIds = getPageContentBlockIds(recordMap, pageId)
  const lines: string[] = []

  for (const blockId of blockIds) {
    const block = recordMap.block[blockId]?.value as {
      properties?: { title?: Decoration[] }
    } | null

    if (!block?.properties?.title) {
      continue
    }

    const text = getTextContent(block.properties.title)
    if (text) {
      lines.push(text)
    }
  }

  return lines.join('\n').trim()
}

function getPageTitle(recordMap: ExtendedRecordMap, pageId: string): string {
  const block = recordMap.block[pageId]?.value as {
    properties?: { title?: Decoration[] }
  } | null

  if (block?.properties?.title) {
    const title = getTextContent(block.properties.title).trim()
    if (title) {
      return title
    }
  }

  return 'Untitled'
}

function getPageUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replaceAll('-', '')}`
}

function normalizeTimestamp(input: unknown): string | null {
  if (!input) {
    return null
  }

  if (typeof input === 'number') {
    const date = new Date(input)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  if (typeof input === 'string') {
    const date = new Date(input)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  return null
}

function getPageLastEditedTime(
  recordMap: ExtendedRecordMap,
  pageId: string
): string | null {
  const block = recordMap.block[pageId]?.value as {
    last_edited_time?: string | number
  } | null

  return normalizeTimestamp(block?.last_edited_time)
}

async function ingestPage(
  pageId: string,
  recordMap: ExtendedRecordMap
): Promise<void> {
  const title = getPageTitle(recordMap, pageId)
  const plainText = extractPlainText(recordMap, pageId)

  if (!plainText) {
    console.warn(`No readable content for Notion page ${pageId}; skipping`)
    return
  }

  const lastEditedTime = getPageLastEditedTime(recordMap, pageId)
  const pageHash = hashChunk(`${pageId}:${plainText}`)
  const sourceUrl = getPageUrl(pageId)

  const existingState = await getDocumentState(pageId)
  const unchanged =
    existingState &&
    existingState.content_hash === pageHash &&
    (!lastEditedTime || existingState.last_source_update === lastEditedTime)

  if (unchanged) {
    console.log(`Skipping unchanged Notion page: ${title}`)
    return
  }

  const chunks = chunkByTokens(plainText, 450, 75)
  if (chunks.length === 0) {
    console.warn(`Chunking produced no content for ${pageId}; skipping`)
    return
  }

  const embeddings = await embedBatch(chunks)

  const rows: ChunkInsert[] = chunks.map((chunk, index) => ({
    doc_id: pageId,
    source_url: sourceUrl,
    title,
    chunk,
    chunk_hash: hashChunk(`${pageId}:${chunk}`),
    embedding: embeddings[index]!
  }))

  await replaceChunks(pageId, rows)
  await upsertDocumentState({
    doc_id: pageId,
    source_url: sourceUrl,
    content_hash: pageHash,
    last_source_update: lastEditedTime ?? null
  })

  console.log(
    `Ingested Notion page: ${title} (${rows.length} chunks)${
      existingState ? ' [updated]' : ''
    }`
  )
}

async function ingestWorkspace(rootPageId: string) {
  const pageMap = await getAllPagesInSpace(
    rootPageId,
    undefined,
    async (pageId) => notion.getPage(pageId)
  )

  const entries = Object.entries(pageMap).filter(
    (entry): entry is [string, ExtendedRecordMap] => Boolean(entry[1])
  )

  await pMap(
    entries,
    async ([pageId, recordMap]) => ingestPage(pageId, recordMap),
    { concurrency: INGEST_CONCURRENCY }
  )
}

async function main() {
  const rootPageId = process.env.NOTION_ROOT_PAGE_ID
  if (!rootPageId) {
    throw new Error('Missing required environment variable "NOTION_ROOT_PAGE_ID"')
  }

  await ingestWorkspace(rootPageId)  
}

await main()
