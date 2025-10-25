import { NotionAPI } from 'notion-client'

import {
  chunkByTokens,
  type ChunkInsert,
  createEmptyRunStats,
  embedBatch,
  extractMainContent,
  extractPlainText,
  finishIngestRun,
  getDocumentState,
  getPageLastEditedTime,
  getPageTitle,
  getPageUrl,
  hashChunk,
  type IngestRunErrorLog,
  type IngestRunHandle,
  type IngestRunStats,
  replaceChunks,
  startIngestRun,
  upsertDocumentState
} from '../rag/index'

const notion = new NotionAPI()

export type ManualIngestionRequest =
  | {
      mode: 'notion_page'
      pageId: string
      ingestionType?: 'full' | 'partial'
    }
  | { mode: 'url'; url: string; ingestionType?: 'full' | 'partial' }

export type ManualIngestionEvent =
  | { type: 'run'; runId: string | null }
  | { type: 'log'; message: string; level?: 'info' | 'warn' | 'error' }
  | { type: 'progress'; step: string; percent: number }
  | {
      type: 'complete'
      status: 'success' | 'completed_with_errors' | 'failed'
      message?: string
      runId: string | null
      stats: IngestRunStats
    }

type EmitFn = (event: ManualIngestionEvent) => Promise<void> | void
type ManualRunStatus = 'success' | 'completed_with_errors' | 'failed'

async function runNotionPageIngestion(
  pageId: string,
  ingestionType: 'full' | 'partial',
  emit: EmitFn
): Promise<void> {
  const pageUrl = getPageUrl(pageId)
  const isFull = ingestionType === 'full'
  const runHandle: IngestRunHandle = await startIngestRun({
    source: 'manual/notion-page',
    ingestion_type: ingestionType,
    partial_reason: isFull ? null : 'Manual Notion page ingest',
    metadata: { pageId, pageUrl, ingestionType }
  })

  await emit({ type: 'run', runId: runHandle?.id ?? null })
  await emit({
    type: 'progress',
    step: 'initializing',
    percent: 5
  })

  const stats = createEmptyRunStats()
  const errorLogs: IngestRunErrorLog[] = []
  const started = Date.now()
  let status: ManualRunStatus = 'success'
  let finalMessage = isFull
    ? 'Manual Notion page full ingestion finished.'
    : 'Manual Notion page ingestion finished.'

  try {
    await emit({
      type: 'log',
      level: 'info',
      message: `Fetching Notion page ${pageId}...`
    })
    const recordMap = await notion.getPage(pageId)
    await emit({
      type: 'progress',
      step: 'fetched',
      percent: 20
    })

    stats.documentsProcessed += 1

    const title = getPageTitle(recordMap, pageId)
    const plainText = extractPlainText(recordMap, pageId)

    if (!plainText) {
      stats.documentsSkipped += 1
      finalMessage = `No readable content found for Notion page ${pageId}; nothing ingested.`
      await emit({
        type: 'log',
        level: 'warn',
        message: finalMessage
      })
      return
    }

    await emit({
      type: 'log',
      level: 'info',
      message: `Preparing ${title} for embedding...`
    })
    await emit({
      type: 'progress',
      step: 'processing',
      percent: 35
    })

    const lastEditedTime = getPageLastEditedTime(recordMap, pageId)
    const contentHash = hashChunk(`${pageId}:${plainText}`)
    const sourceUrl = getPageUrl(pageId)

    const existingState = await getDocumentState(pageId)

    const unchanged =
      existingState &&
      existingState.content_hash === contentHash

    if (unchanged) {
      stats.documentsSkipped += 1
      finalMessage = `No changes detected for Notion page ${title}; skipping ingest.`
      await emit({
        type: 'log',
        level: 'info',
        message: finalMessage
      })
      return
    }

    const chunks = chunkByTokens(plainText, 450, 75)
    if (chunks.length === 0) {
      stats.documentsSkipped += 1
      finalMessage = `Chunking produced no content for Notion page ${title}; nothing stored.`
      await emit({
        type: 'log',
        level: 'warn',
        message: finalMessage
      })
      return
    }

    await emit({
      type: 'progress',
      step: 'embedding',
      percent: 60
    })
    await emit({
      type: 'log',
      level: 'info',
      message: `Embedding ${chunks.length} chunk(s)...`
    })
    const embeddings = await embedBatch(chunks)
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

    await emit({
      type: 'progress',
      step: 'saving',
      percent: 85
    })
    await replaceChunks(pageId, rows)
    await upsertDocumentState({
      doc_id: pageId,
      source_url: sourceUrl,
      content_hash: contentHash,
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

    await emit({
      type: 'log',
      level: 'info',
      message: `Stored ${chunkCount} chunk(s) for ${title}.`
    })
  } catch (err) {
    status = 'failed'
    stats.errorCount += 1
    const message = err instanceof Error ? err.message : String(err)
    finalMessage = `${
      isFull
        ? 'Manual Notion page full ingestion failed'
        : 'Manual Notion ingestion failed'
    }: ${message}`
    errorLogs.push({
      context: 'fatal',
      doc_id: pageId,
      message
    })
    await emit({
      type: 'log',
      level: 'error',
      message: finalMessage
    })
  } finally {
    const durationMs = Date.now() - started
    if (status === 'failed' && stats.errorCount === 0) {
      stats.errorCount = 1
    }

    if (stats.errorCount > 0 && status === 'success') {
      status = 'completed_with_errors'
    }

    await finishIngestRun(runHandle, {
      status,
      durationMs,
      totals: stats,
      errorLogs
    })

    await emit({
      type: 'progress',
      step: 'finished',
      percent: 100
    })
    await emit({
      type: 'complete',
      status,
      message: finalMessage,
      runId: runHandle?.id ?? null,
      stats
    })
  }
}

async function runUrlIngestion(
  url: string,
  ingestionType: 'full' | 'partial',
  emit: EmitFn
): Promise<void> {
  const parsedUrl = new URL(url)
  const runHandle: IngestRunHandle = await startIngestRun({
    source: 'manual/url',
    ingestion_type: ingestionType,
    partial_reason:
      ingestionType === 'full' ? null : 'Manual URL ingest',
    metadata: { url, hostname: parsedUrl.hostname, ingestionType }
  })

  await emit({ type: 'run', runId: runHandle?.id ?? null })
  await emit({
    type: 'progress',
    step: 'initializing',
    percent: 5
  })

  const stats = createEmptyRunStats()
  const errorLogs: IngestRunErrorLog[] = []
  const started = Date.now()
  let status: ManualRunStatus = 'success'
  let finalMessage =
    ingestionType === 'full'
      ? 'Manual URL full ingestion finished.'
      : 'Manual URL ingestion finished.'

  try {
    stats.documentsProcessed += 1
    await emit({
      type: 'log',
      level: 'info',
      message: `Fetching ${url}...`
    })
    const { title, text, lastModified } = await extractMainContent(url)
    await emit({
      type: 'progress',
      step: 'fetched',
      percent: 25
    })

    if (!text) {
      stats.documentsSkipped += 1
      finalMessage = `No readable text extracted from ${url}; nothing ingested.`
      await emit({
        type: 'log',
        level: 'warn',
        message: finalMessage
      })
      return
    }

    const contentHash = hashChunk(`${url}:${text}`)
    const existingState = await getDocumentState(url)
    const unchanged =
      existingState &&
      existingState.content_hash === contentHash &&
      (!lastModified || existingState.last_source_update === lastModified)

    if (unchanged && ingestionType === 'partial') {
      stats.documentsSkipped += 1
      finalMessage = `No changes detected for ${title}; skipping ingest.`
      await emit({
        type: 'log',
        level: 'info',
        message: finalMessage
      })
      return
    }

    await emit({
      type: 'progress',
      step: 'processing',
      percent: 45
    })
    const chunks = chunkByTokens(text, 450, 75)

    if (chunks.length === 0) {
      stats.documentsSkipped += 1
      finalMessage = `Extracted content produced no chunks for ${url}; nothing stored.`
      await emit({
        type: 'log',
        level: 'warn',
        message: finalMessage
      })
      return
    }

    await emit({
      type: 'log',
      level: 'info',
      message: `Embedding ${chunks.length} chunk(s)...`
    })
    await emit({
      type: 'progress',
      step: 'embedding',
      percent: 65
    })
    const embeddings = await embedBatch(chunks)
    const ingestedAt = new Date().toISOString()

    const rows: ChunkInsert[] = chunks.map((chunk, index) => ({
      doc_id: url,
      source_url: url,
      title,
      chunk,
      chunk_hash: hashChunk(`${url}:${chunk}`),
      embedding: embeddings[index]!,
      ingested_at: ingestedAt
    }))

    const chunkCount = rows.length
    const totalCharacters = rows.reduce((sum, row) => sum + row.chunk.length, 0)

    await emit({
      type: 'progress',
      step: 'saving',
      percent: 85
    })
    await replaceChunks(url, rows)
    await upsertDocumentState({
      doc_id: url,
      source_url: url,
      content_hash: contentHash,
      last_source_update: lastModified ?? null,
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

    await emit({
      type: 'log',
      level: 'info',
      message: `Stored ${chunkCount} chunk(s) for ${title}.`
    })
  } catch (err) {
    status = 'failed'
    stats.errorCount += 1
    const message = err instanceof Error ? err.message : String(err)
    finalMessage = `${
      ingestionType === 'full'
        ? 'Manual URL full ingestion failed'
        : 'Manual URL ingestion failed'
    }: ${message}`
    errorLogs.push({
      context: 'fatal',
      doc_id: url,
      message
    })
    await emit({
      type: 'log',
      level: 'error',
      message: finalMessage
    })
  } finally {
    const durationMs = Date.now() - started
    if (status === 'failed' && stats.errorCount === 0) {
      stats.errorCount = 1
    }

    if (stats.errorCount > 0 && status === 'success') {
      status = 'completed_with_errors'
    }

    await finishIngestRun(runHandle, {
      status,
      durationMs,
      totals: stats,
      errorLogs
    })

    await emit({
      type: 'progress',
      step: 'finished',
      percent: 100
    })
    await emit({
      type: 'complete',
      status,
      message: finalMessage,
      runId: runHandle?.id ?? null,
      stats
    })
  }
}

export async function runManualIngestion(
  request: ManualIngestionRequest,
  emit: EmitFn
): Promise<void> {
  if (request.mode === 'notion_page') {
    const ingestionType = request.ingestionType ?? 'partial'
    await runNotionPageIngestion(request.pageId, ingestionType, emit)
    return
  }

  const ingestionType = request.ingestionType ?? 'partial'
  await runUrlIngestion(request.url, ingestionType, emit)
}
