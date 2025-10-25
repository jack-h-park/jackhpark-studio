// scripts/ingest.ts
import { loadEnvConfig } from '@next/env'
import pMap from 'p-map'

import {
  chunkByTokens,
  type ChunkInsert,
  createEmptyRunStats,
  embedBatch,
  type ExtractedArticle,
  extractMainContent,
  finishIngestRun,
  getDocumentState,
  hashChunk,
  type IngestRunErrorLog,
  type IngestRunHandle,
  type IngestRunStats,
  replaceChunks,
  startIngestRun,
  upsertDocumentState
} from '../lib/rag'

loadEnvConfig(process.cwd())

const INGEST_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.INGEST_CONCURRENCY ?? '4', 10)
)

type RunMode = {
  type: 'full' | 'partial'
  reason?: string | null
}

type ParsedArgs = {
  mode: RunMode
  urls: string[]
}

function parseArgs(defaultType: 'full' | 'partial'): ParsedArgs {
  const raw = process.argv.slice(2)
  const urls: string[] = []
  let mode: RunMode = { type: defaultType }

  for (let i = 0; i < raw.length; i += 1) {
    const arg = raw[i]!

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
      const next = raw[i + 1]
      if (next && !next.startsWith('--')) {
        mode = { ...mode, reason: next }
        i += 1
      }
      continue
    }

    if (arg.startsWith('--reason=')) {
      mode = { ...mode, reason: arg.slice(Math.max(0, arg.indexOf('=') + 1)) }
      continue
    }

    urls.push(arg)
  }

  return { mode, urls }
}

async function ingestUrl(
  url: string,
  stats: IngestRunStats
): Promise<void> {
  stats.documentsProcessed += 1

  const { title, text, lastModified }: ExtractedArticle = await extractMainContent(url)

  if (!text) {
    console.warn(`No text content extracted for ${url}; skipping`)
    stats.documentsSkipped += 1
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
    stats.documentsSkipped += 1
    return
  }

  const chunks = chunkByTokens(text, 450, 75)

  if (chunks.length === 0) {
    console.warn(`Extracted content for ${url} produced no chunks; skipping`)
    stats.documentsSkipped += 1
    return
  }

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

  console.log(
    `Ingested URL: ${title} (${chunkCount} chunks) [${
      existingState ? 'updated' : 'new'
    }]`
  )
}

async function main(): Promise<void> {
  const { mode, urls } = parseArgs('partial')
  const targets = urls.filter(Boolean)

  if (targets.length === 0) {
    console.error(
      'Usage: pnpm tsx scripts/ingest.ts [--full|--partial] [--reason "..."] <url> [url...]'
    )
    process.exitCode = 1
    return
  }

  const resolvedReason =
    mode.type === 'partial'
      ? mode.reason ?? 'Targeted URL ingest'
      : mode.reason ?? null

  const runHandle: IngestRunHandle = await startIngestRun({
    source: 'web',
    ingestion_type: mode.type,
    partial_reason: resolvedReason ?? null,
    metadata: { urlCount: targets.length }
  })

  const stats = createEmptyRunStats()
  const errorLogs: IngestRunErrorLog[] = []
  const started = Date.now()

  try {
    await pMap(
      targets,
      async (url) => {
        try {
          await ingestUrl(url, stats)
        } catch (err) {
          stats.errorCount += 1
          const message =
            err instanceof Error ? err.message : JSON.stringify(err)
          errorLogs.push({ context: url, message })
          console.error(`Failed to ingest ${url}: ${message}`)
        }
      },
      { concurrency: INGEST_CONCURRENCY }
    )

    const durationMs = Date.now() - started
    const status =
      stats.errorCount > 0 ? 'completed_with_errors' : 'success'

    await finishIngestRun(runHandle, {
      status,
      durationMs,
      totals: stats,
      errorLogs
    })

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

    throw err
  }
}

await main()
