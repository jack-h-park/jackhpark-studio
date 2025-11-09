// scripts/ingest-notion.ts
import { NotionAPI } from 'notion-client'
import { type ExtendedRecordMap } from 'notion-types'
import { getAllPagesInSpace } from 'notion-utils'
import pMap from 'p-map' 

import { normalizeEmbeddingProvider } from '../lib/core/model-provider'
import {
  chunkByTokens,
  type ChunkInsert,
  createEmptyRunStats,
  embedBatch,
  extractPlainText,
  finishIngestRun,
  getDocumentState,
  getPageLastEditedTime,
  getPageTitle,
  getPageUrl,
  hasChunksForProvider,
  hashChunk,
  type IngestRunErrorLog,
  type IngestRunHandle,
  type IngestRunStats,
  replaceChunks,
  startIngestRun, // This line is already present, no change needed.
  upsertDocumentState
} from '../lib/rag'

const notion = new NotionAPI()
const DEFAULT_EMBEDDING_PROVIDER = normalizeEmbeddingProvider(
  process.env.EMBEDDING_PROVIDER ?? process.env.LLM_PROVIDER ?? null
)

type RunMode = {
  type: 'full' | 'partial'
  reason?: string | null
}

function parseRunMode(defaultType: 'full' | 'partial'): RunMode {
  const args = process.argv.slice(2)
  let mode: RunMode = { type: defaultType }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!

    if (arg === '--full' || arg === '--mode=full') {
      mode = { type: 'full' }
      continue
    }

    if (arg === '--partial' || arg === '--mode=partial') {
      mode = { type: 'partial' }
      continue
    }

    if (arg.startsWith('--mode=')) {
      const value = arg.split('=')[1]
      if (value === 'full' || value === 'partial') {
        mode = { type: value }
      }
      continue
    }

    if (arg === '--reason') {
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        mode = { ...mode, reason: next }
        i += 1
      }
      continue
    }

    if (arg.startsWith('--reason=')) {
      mode = { ...mode, reason: arg.slice(Math.max(0, arg.indexOf('=') + 1)) }
    }
  }

  return mode
}
const INGEST_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.INGEST_CONCURRENCY ?? '2', 10)
)

async function ingestPage(
  pageId: string,
  recordMap: ExtendedRecordMap,
  stats: IngestRunStats
): Promise<void> {
  stats.documentsProcessed += 1

  const title = getPageTitle(recordMap, pageId)
  const plainText = extractPlainText(recordMap, pageId)

  if (!plainText) {
    console.warn(`No readable content for Notion page ${pageId}; skipping`)
    stats.documentsSkipped += 1
    return
  }

  const lastEditedTime = getPageLastEditedTime(recordMap, pageId)
  const pageHash = hashChunk(`${pageId}:${plainText}`)
  const sourceUrl = getPageUrl(pageId)

  const existingState = await getDocumentState(pageId)
  const unchanged =
    existingState && existingState.content_hash === pageHash

  const embeddingProvider = DEFAULT_EMBEDDING_PROVIDER
  if (unchanged) {
    const providerHasChunks = await hasChunksForProvider(
      pageId,
      embeddingProvider
    )
    if (providerHasChunks) {
      console.log(`Skipping unchanged Notion page: ${title}`)
      stats.documentsSkipped += 1
      return
    }
  }

  const chunks = chunkByTokens(plainText, 450, 75)
  if (chunks.length === 0) {
    console.warn(`Chunking produced no content for ${pageId}; skipping`)
    stats.documentsSkipped += 1
    return
  }

  const embeddings = await embedBatch(chunks, { provider: embeddingProvider })
  const ingestedAt = new Date().toISOString()

  const rows: ChunkInsert[] = chunks.map((chunk, index) => ({
    doc_id: pageId,
    source_url: sourceUrl,
    title,
    chunk,
    chunk_hash: hashChunk(`${pageId}:${chunk}`),
    embedding: embeddings[index]!,
    ingested_at: ingestedAt
  }))

  const chunkCount = rows.length
  const totalCharacters = rows.reduce((sum, row) => sum + row.chunk.length, 0)

  await replaceChunks(pageId, rows, { provider: embeddingProvider })
  await upsertDocumentState({
    doc_id: pageId,
    source_url: sourceUrl,
    content_hash: pageHash,
    last_source_update: lastEditedTime ?? null,
    chunk_count: chunkCount,
    total_characters: totalCharacters
  })

  if (existingState) {
    stats.documentsUpdated += 1
    stats.chunksUpdated += chunkCount
    stats.charactersUpdated += totalCharacters
  } else {
    stats.documentsAdded += 1
    stats.chunksAdded += chunkCount
    stats.charactersAdded += totalCharacters
  }

  console.log(
    `Ingested Notion page: ${title} (${chunkCount} chunks) [${
      existingState ? 'updated' : 'new'
    }]`
  )
}

async function ingestWorkspace(
  rootPageId: string,
  stats: IngestRunStats,
  errorLogs: IngestRunErrorLog[]
) {
  console.log(`\nFetching all pages in Notion space (root: ${rootPageId})...`)
  const pageMap = await getAllPagesInSpace(
    rootPageId,
    undefined,
    async (pageId) => notion.getPage(pageId)
  )

  console.log(`Found ${Object.keys(pageMap).length} total pages.`)

  const entries = Object.entries(pageMap).filter(
    (entry): entry is [string, ExtendedRecordMap] => Boolean(entry[1])
  )

  if (entries.length === 0) {
    console.log('No pages to ingest.')
    return
  }

  await pMap(
    entries,
    async ([pageId, recordMap]) => {
      try {
        await ingestPage(pageId, recordMap, stats)
      } catch (err) {
        stats.errorCount += 1
        const message =
          err instanceof Error ? err.message : JSON.stringify(err)
        errorLogs.push({
          doc_id: pageId,
          message
        })
        console.error(`Failed to ingest Notion page ${pageId}: ${message}`)
      }
    },
    { concurrency: INGEST_CONCURRENCY }
  )
}

async function main() {
  const rootPageId = process.env.NOTION_ROOT_PAGE_ID
  if (!rootPageId) {
    throw new Error('Missing required environment variable "NOTION_ROOT_PAGE_ID"')
  }

  console.log('Starting Notion ingestion...')

  const mode = parseRunMode('full')
  const resolvedReason =
    mode.type === 'partial'
      ? mode.reason ?? 'Partial ingest (CLI override)'
      : null

  const runHandle: IngestRunHandle = await startIngestRun({
    source: 'notion',
    ingestion_type: mode.type,
    partial_reason: resolvedReason,
    metadata: { rootPageId, embeddingProvider: DEFAULT_EMBEDDING_PROVIDER }
  })

  const stats = createEmptyRunStats()
  const errorLogs: IngestRunErrorLog[] = []
  const started = Date.now()

  try {
    await ingestWorkspace(rootPageId, stats, errorLogs)
    const durationMs = Date.now() - started
    const status =
      stats.errorCount > 0 ? 'completed_with_errors' : 'success'

    await finishIngestRun(runHandle, {
      status,
      durationMs,
      totals: stats,
      errorLogs
    })

    console.log('\n--- Ingestion Complete ---')
    console.log(`Duration: ${(durationMs / 1000).toFixed(2)}s`)
    console.log(`Status: ${status}`)
    console.log('Documents:')
    console.log(`  - Processed: ${stats.documentsProcessed}`)
    console.log(`  - Added:     ${stats.documentsAdded}`)
    console.log(`  - Updated:   ${stats.documentsUpdated}`)
    console.log(`  - Skipped:   ${stats.documentsSkipped}`)
    console.log('Chunks:')
    console.log(`  - Added:     ${stats.chunksAdded}`)
    console.log(`  - Updated:   ${stats.chunksUpdated}`)
    console.log('Characters:')
    console.log(`  - Added:     ${stats.charactersAdded}`)
    console.log(`  - Updated:   ${stats.charactersUpdated}`)
    console.log(`Errors: ${stats.errorCount}`)

    if (stats.errorCount > 0) {
      process.exitCode = 1
    }
  } catch (err) {
    const durationMs = Date.now() - started
    const message = err instanceof Error ? err.message : String(err)
    errorLogs.push({ context: 'fatal', message })
    stats.errorCount += 1

    await finishIngestRun(runHandle, {
      status: 'failed',
      durationMs,
      totals: stats,
      errorLogs
    })

    console.error('\n--- Ingestion Failed ---')
    console.error(err)
    throw err
  }
}

await main()
