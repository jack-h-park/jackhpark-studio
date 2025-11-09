import { NotionAPI } from 'notion-client'
import { type ExtendedRecordMap } from 'notion-types'
import { getAllPagesInSpace, parsePageId } from 'notion-utils'

import type { ModelProvider } from '../shared/model-provider'
import {
  chunkByTokens,
  type ChunkInsert,
  createEmptyRunStats,
  embedBatch,
  type EmbedBatchOptions,
  extractMainContent,
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
  normalizeTimestamp,
  replaceChunks,
  startIngestRun,
  upsertDocumentState
} from '../rag/index'

const notion = new NotionAPI()

type ManualIngestionBase = {
  ingestionType?: 'full' | 'partial'
  embeddingProvider?: ModelProvider
  embeddingModel?: string | null
}

export type ManualIngestionRequest =
  | (ManualIngestionBase & {
      mode: 'notion_page'
      pageId: string
      includeLinkedPages?: boolean
    })
  | (ManualIngestionBase & { mode: 'url'; url: string })

export type ManualIngestionEvent =
  | { type: 'run'; runId: string | null }
  | { type: 'log'; message: string; level?: 'info' | 'warn' | 'error' }
  | { type: 'progress'; step: string; percent: number }
  | {
      type: 'queue'
      current: number
      total: number
      pageId: string
      title: string | null
    }
  | {
      type: 'complete'
      status: 'success' | 'completed_with_errors' | 'failed'
      message?: string
      runId: string | null
      stats: IngestRunStats
    }

type EmitFn = (event: ManualIngestionEvent) => Promise<void> | void
type ManualRunStatus = 'success' | 'completed_with_errors' | 'failed'

async function ingestNotionPage({
  pageId,
  recordMap,
  ingestionType,
  stats,
  emit,
  embeddingOptions
}: {
  pageId: string
  recordMap: ExtendedRecordMap
  ingestionType: 'full' | 'partial'
  stats: IngestRunStats
  emit: EmitFn
  embeddingOptions: EmbedBatchOptions
}): Promise<void> {
  const isFull = ingestionType === 'full'

  stats.documentsProcessed += 1
  const title = getPageTitle(recordMap, pageId)
  await emit({
    type: 'log',
    level: 'info',
    message: `Fetched Notion page "${title}" (${pageId}).`
  })
  await emit({
    type: 'progress',
    step: 'fetched',
    percent: 20
  })

  const plainText = extractPlainText(recordMap, pageId)

  if (!plainText) {
    stats.documentsSkipped += 1
    await emit({
      type: 'log',
      level: 'warn',
      message: `No readable content found for Notion page "${title}" (${pageId}); nothing ingested.`
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

  const normalizedLastEdited = normalizeTimestamp(lastEditedTime)
  const normalizedExistingUpdate = normalizeTimestamp(
    existingState?.last_source_update ?? null
  )

  const unchanged =
    existingState &&
    existingState.content_hash === contentHash &&
    (!normalizedLastEdited ||
      normalizedExistingUpdate === normalizedLastEdited)

  let providerHasChunks = false
  if (unchanged) {
    providerHasChunks = await hasChunksForProvider(
      pageId,
      embeddingOptions.provider ?? null
    )
  }

  if (!isFull && unchanged && providerHasChunks) {
    stats.documentsSkipped += 1
    await emit({
      type: 'log',
      level: 'info',
      message: `No changes detected for Notion page "${title}" (${pageId}); skipping ingest.`
    })
    return
  }

  const chunks = chunkByTokens(plainText, 450, 75)
  if (chunks.length === 0) {
    stats.documentsSkipped += 1
    await emit({
      type: 'log',
      level: 'warn',
      message: `Chunking produced no content for Notion page ${title}; nothing stored.`
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
  const embeddings = await embedBatch(chunks, embeddingOptions)
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
  await replaceChunks(pageId, rows, {
    provider: embeddingOptions.provider ?? null
  })
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

  return
}

async function runNotionPageIngestion(
  pageId: string,
  ingestionType: 'full' | 'partial',
  includeLinkedPages: boolean,
  embeddingOptions: EmbedBatchOptions,
  emit: EmitFn
): Promise<void> {
  const pageUrl = getPageUrl(pageId)
  const isFull = ingestionType === 'full'
  const runHandle: IngestRunHandle = await startIngestRun({
    source: 'manual/notion-page',
    ingestion_type: ingestionType,
    partial_reason: isFull ? null : 'Manual Notion page ingest',
    metadata: {
      pageId,
      pageUrl,
      ingestionType,
      includeLinkedPages,
      embeddingProvider: embeddingOptions.provider ?? null
    }
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
  let finalMessage = includeLinkedPages
    ? isFull
      ? 'Manual Notion full ingestion (linked pages) finished.'
      : 'Manual Notion ingestion (linked pages) finished.'
    : isFull
      ? 'Manual Notion page full ingestion finished.'
      : 'Manual Notion page ingestion finished.'

  type CandidatePage = {
    pageId: string
  }

  const candidatePages: CandidatePage[] = []
  const seen = new Set<string>()

  const pushCandidate = (id: string) => {
    const normalized = parsePageId(id, { uuid: true }) ?? id
    if (seen.has(normalized)) {
      return
    }
    seen.add(normalized)
    candidatePages.push({ pageId: normalized })
  }

  if (includeLinkedPages) {
    try {
      await emit({
        type: 'log',
        level: 'info',
        message: `Discovering linked Notion pages starting from ${pageId}...`
      })

      const pageMap = await getAllPagesInSpace(
        pageId,
        undefined,
        async (candidateId) => notion.getPage(candidateId)
      )

      pushCandidate(pageId)

      for (const [rawId, recordMap] of Object.entries(pageMap)) {
        if (!recordMap) {
          continue
        }
        const normalized = parsePageId(rawId, { uuid: true }) ?? rawId
        pushCandidate(normalized)
      }

      await emit({
        type: 'log',
        level: 'info',
        message: `Identified ${candidatePages.length} page(s) for ingestion.`
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to enumerate linked pages.'
      await emit({
        type: 'log',
        level: 'warn',
        message: `Could not enumerate linked pages: ${message}. Falling back to the selected page only.`
      })
    }
  }

  if (candidatePages.length === 0) {
    pushCandidate(pageId)
  }

  const processedPages: string[] = []

  try {
    for (let index = 0; index < candidatePages.length; index += 1) {
      const candidate = candidatePages[index]!
      const currentPageId = candidate.pageId

      if (processedPages.includes(currentPageId)) {
        continue
      }
      processedPages.push(currentPageId)

      let recordMap: ExtendedRecordMap | null = null

      try {
        await emit({
          type: 'log',
          level: 'info',
          message: `Fetching Notion page ${currentPageId}...`
        })

        recordMap = await notion.getPage(currentPageId)
      } catch (err) {
        stats.errorCount += 1
        const message = err instanceof Error ? err.message : String(err)
        errorLogs.push({
          context: 'fatal',
          doc_id: currentPageId,
          message
        })
        await emit({
          type: 'log',
          level: 'error',
          message: `Failed to load Notion page ${currentPageId}: ${message}`
        })
        continue
      }

      if (!recordMap) {
        stats.documentsSkipped += 1
        await emit({
          type: 'log',
          level: 'warn',
          message: `Unable to load Notion page ${currentPageId}; skipping.`
        })
        continue
      }

      const title = getPageTitle(recordMap, currentPageId)

      await emit({
        type: 'queue',
        current: index + 1,
        total: candidatePages.length,
        pageId: currentPageId,
        title: title ?? null
      })

      try {
        await ingestNotionPage({
          pageId: currentPageId,
          recordMap,
          ingestionType,
          stats,
          emit,
          embeddingOptions
        })
      } catch (err) {
        stats.errorCount += 1
        const message = err instanceof Error ? err.message : String(err)
        errorLogs.push({
          context: 'fatal',
          doc_id: currentPageId,
          message
        })
        await emit({
          type: 'log',
          level: 'error',
          message: `Failed to ingest Notion page ${currentPageId}: ${message}`
        })
      }
    }

    const updatedPages = stats.documentsAdded + stats.documentsUpdated
    const skippedPages = stats.documentsSkipped

    if (status === 'success') {
      if (includeLinkedPages) {
        finalMessage =
          processedPages.length === 0
            ? 'No Notion pages were available to ingest.'
            : `Processed ${processedPages.length} Notion page(s); updated ${updatedPages}, skipped ${skippedPages}.`
      } else {
        finalMessage =
          updatedPages > 0
            ? 'Manual Notion page ingestion finished.'
            : 'Manual Notion page ingestion found no changes.'
      }
    }
  } catch (err) {
    status = 'failed'
    stats.errorCount += 1
    const message = err instanceof Error ? err.message : String(err)
    const failingPageId =
      (err as { ingestionPageId?: string | null })?.ingestionPageId ?? pageId
    finalMessage = `${
      includeLinkedPages
        ? isFull
          ? 'Manual Notion full ingestion (linked pages) failed'
          : 'Manual Notion ingestion (linked pages) failed'
        : isFull
          ? 'Manual Notion page full ingestion failed'
          : 'Manual Notion ingestion failed'
    }: ${message}`
    errorLogs.push({
      context: 'fatal',
      doc_id: failingPageId,
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
  embeddingOptions: EmbedBatchOptions,
  emit: EmitFn
): Promise<void> {
  const parsedUrl = new URL(url)
  const runHandle: IngestRunHandle = await startIngestRun({
    source: 'manual/url',
    ingestion_type: ingestionType,
    partial_reason:
      ingestionType === 'full' ? null : 'Manual URL ingest',
    metadata: {
      url,
      hostname: parsedUrl.hostname,
      ingestionType,
      embeddingProvider: embeddingOptions.provider ?? null
    }
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

    let providerHasChunks = false
    if (unchanged) {
      providerHasChunks = await hasChunksForProvider(
        url,
        embeddingOptions.provider ?? null
      )
    }

    if (unchanged && ingestionType === 'partial' && providerHasChunks) {
      stats.documentsSkipped += 1
      finalMessage = `No changes detected for ${title} (${url}); skipping ingest.`
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
    const embeddings = await embedBatch(chunks, embeddingOptions)
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
    await replaceChunks(url, rows, {
      provider: embeddingOptions.provider ?? null
    })
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
  const embeddingOptions: EmbedBatchOptions = {
    provider: request.embeddingProvider ?? null,
    model: request.embeddingModel ?? null
  }

  if (request.mode === 'notion_page') {
    const ingestionType = request.ingestionType ?? 'partial'
    const includeLinkedPages = request.includeLinkedPages ?? true
    await runNotionPageIngestion(
      request.pageId,
      ingestionType,
      includeLinkedPages,
      embeddingOptions,
      emit
    )
    return
  }

  const ingestionType = request.ingestionType ?? 'partial'
  await runUrlIngestion(request.url, ingestionType, embeddingOptions, emit)
}
