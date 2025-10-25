import { Readability } from '@mozilla/readability'
import { type PostgrestError } from '@supabase/supabase-js'
import { backOff } from 'exponential-backoff'
import { encode } from 'gpt-tokenizer'
import { JSDOM } from 'jsdom'
import { type Decoration, type ExtendedRecordMap } from 'notion-types'
import { getPageContentBlockIds, getTextContent } from 'notion-utils'

import { EMBEDDING_MODEL, openai, USER_AGENT } from '../core/openai'
import { supabaseClient } from '../core/supabase'

const DOCUMENTS_TABLE = 'rag_documents'
let documentStateTableStatus: 'unknown' | 'available' | 'missing' = 'unknown'
let documentStateWarningLogged = false

export type ChunkInsert = {
  doc_id: string
  source_url: string
  title: string
  chunk: string
  chunk_hash: string
  embedding: number[]
  ingested_at?: string
}

async function retry<T>(
  operation: () => Promise<T>,
  description: string
): Promise<T> {
  return backOff(operation, {
    startingDelay: 500,
    numOfAttempts: 4,
    retry: (e, attemptNumber) => {
      console.warn(`[ingest:retry] ${description} failed (attempt ${attemptNumber}). Retrying...`, e)
      return true
    }
  })
}

export type DocumentState = {
  doc_id: string
  source_url: string
  content_hash: string
  last_ingested_at: string
  last_source_update: string | null
  chunk_count: number | null
  total_characters: number | null
}

export type DocumentStateUpsert = {
  doc_id: string
  source_url: string
  content_hash: string
  last_source_update?: string | null
  chunk_count?: number
  total_characters?: number
}

function isMissingTableError(error: PostgrestError | null): boolean {
  if (!error) {
    return false
  }

  return error.code === '42P01' || error.code === 'PGRST116'
}

function handleDocumentStateError(error: PostgrestError | null): boolean {
  if (!isMissingTableError(error)) {
    return false
  }

  documentStateTableStatus = 'missing'
  if (!documentStateWarningLogged) {
    console.warn(
      '[ingest] Supabase table "rag_documents" was not found. Document-level caching will be skipped.'
    )
    documentStateWarningLogged = true
  }
  return true
}

export async function getDocumentState(
  docId: string
): Promise<DocumentState | null> {
  if (documentStateTableStatus === 'missing') {
    return null
  }

  const { data, error } = await supabaseClient
    .from(DOCUMENTS_TABLE)
    .select(
      'doc_id, source_url, content_hash, last_ingested_at, last_source_update, chunk_count, total_characters'
    )
    .eq('doc_id', docId)
    .maybeSingle()

  if (error) {
    if (handleDocumentStateError(error)) {
      return null
    }
    throw error
  }

  documentStateTableStatus = 'available'
  return data ?? null
}

export async function upsertDocumentState(
  toUpsert: DocumentStateUpsert
): Promise<void> {
  if (documentStateTableStatus === 'missing') {
    return
  }

  const payload = {
    doc_id: toUpsert.doc_id,
    source_url: toUpsert.source_url,
    content_hash: toUpsert.content_hash,
    last_ingested_at: new Date().toISOString(),
    last_source_update:
      toUpsert.last_source_update === undefined
        ? null
        : toUpsert.last_source_update,
    chunk_count:
      toUpsert.chunk_count === undefined ? null : toUpsert.chunk_count,
    total_characters:
      toUpsert.total_characters === undefined
        ? null
        : toUpsert.total_characters
  }

  const { error } = await retry(
    () => supabaseClient.from(DOCUMENTS_TABLE).upsert(payload, { onConflict: 'doc_id' }),
    'upsert document state'
  )

  if (error) {
    if (handleDocumentStateError(error)) {
      return
    }
    throw error
  }

  documentStateTableStatus = 'available'
}

const INGEST_RUNS_TABLE = 'rag_ingest_runs'
let ingestRunsTableStatus: 'unknown' | 'available' | 'missing' = 'unknown'
let ingestRunsWarningLogged = false

type IngestRunStatus =
  | 'in_progress'
  | 'success'
  | 'completed_with_errors'
  | 'failed'

export type IngestRunStartInput = {
  source: string
  ingestion_type: 'full' | 'partial'
  partial_reason?: string | null
  metadata?: Record<string, unknown> | null
}

export type IngestRunHandle = {
  id: string
} | null

export type IngestRunErrorLog = {
  context?: string | null
  doc_id?: string | null
  message: string
}

export type IngestRunStats = {
  documentsProcessed: number
  documentsAdded: number
  documentsUpdated: number
  documentsSkipped: number
  chunksAdded: number
  chunksUpdated: number
  charactersAdded: number
  charactersUpdated: number
  errorCount: number
}

export type IngestRunFinishInput = {
  status: Exclude<IngestRunStatus, 'in_progress'>
  durationMs: number
  totals: IngestRunStats
  errorLogs?: IngestRunErrorLog[]
}

export function createEmptyRunStats(): IngestRunStats {
  return {
    documentsProcessed: 0,
    documentsAdded: 0,
    documentsUpdated: 0,
    documentsSkipped: 0,
    chunksAdded: 0,
    chunksUpdated: 0,
    charactersAdded: 0,
    charactersUpdated: 0,
    errorCount: 0
  }
}

function handleIngestRunsError(error: PostgrestError | null): boolean {
  if (!isMissingTableError(error)) {
    return false
  }

  ingestRunsTableStatus = 'missing'
  if (!ingestRunsWarningLogged) {
    console.warn(
      '[ingest] Supabase table "rag_ingest_runs" was not found. Run-level logging will be skipped.'
    )
    ingestRunsWarningLogged = true
  }
  return true
}

export async function startIngestRun(
  input: IngestRunStartInput
): Promise<IngestRunHandle> {
  if (ingestRunsTableStatus === 'missing') {
    return null
  }

  const payload = {
    source: input.source,
    ingestion_type: input.ingestion_type,
    partial_reason: input.partial_reason ?? null,
    status: 'in_progress' as IngestRunStatus,
    started_at: new Date().toISOString(),
    metadata: input.metadata ?? null
  }

  const { data, error } = await supabaseClient
    .from(INGEST_RUNS_TABLE)
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    if (handleIngestRunsError(error)) {
      return null
    }
    throw error
  }

  ingestRunsTableStatus = 'available'
  return { id: data.id as string }
}

export async function finishIngestRun(
  handle: IngestRunHandle,
  input: IngestRunFinishInput
): Promise<void> {
  if (!handle || ingestRunsTableStatus === 'missing') {
    return
  }

  const payload = {
    status: input.status,
    ended_at: new Date().toISOString(),
    duration_ms: input.durationMs,
    documents_processed: input.totals.documentsProcessed,
    documents_added: input.totals.documentsAdded,
    documents_updated: input.totals.documentsUpdated,
    documents_skipped: input.totals.documentsSkipped,
    chunks_added: input.totals.chunksAdded,
    chunks_updated: input.totals.chunksUpdated,
    characters_added: input.totals.charactersAdded,
    characters_updated: input.totals.charactersUpdated,
    error_count: input.totals.errorCount,
    error_logs: (input.errorLogs ?? []).slice(0, 50)
  }

  const { error } = await supabaseClient
    .from(INGEST_RUNS_TABLE)
    .update(payload)
    .eq('id', handle.id)

  if (error) {
    handleIngestRunsError(error)
  }
}

export function chunkByTokens(
  text: string,
  maxTokens = 450,
  overlap = 75
): string[] {
  const words = text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)

  if (words.length === 0) {
    return []
  }

  const chunks: string[] = []
  let currentWords: string[] = []
  let currentTokens = 0

  const flush = () => {
    if (currentWords.length === 0) {
      return
    }

    const chunkText = currentWords.join(' ').trim()
    if (chunkText.length > 0) {
      chunks.push(chunkText)
    }

    if (overlap > 0) {
      const overlapWords: string[] = []
      let overlapTokens = 0
      for (let i = currentWords.length - 1; i >= 0; i -= 1) {
        const word = currentWords[i]!
        const wordTokens = encode(`${word} `).length
        overlapTokens += wordTokens
        overlapWords.push(word)
        if (overlapTokens >= overlap) {
          break
        }
      }
      const overlapped = overlapWords.toReversed()
      currentWords = overlapped
      currentTokens = overlapped.reduce(
        (sum, word) => sum + encode(`${word} `).length,
        0
      )
    } else {
      currentWords = []
      currentTokens = 0
    }
  }

  for (const word of words) {
    const wordTokens = encode(`${word} `).length
    if (currentTokens + wordTokens > maxTokens && currentWords.length > 0) {
      flush()
    }

    currentWords.push(word)
    currentTokens += wordTokens
  }

  flush()

  return chunks
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return []
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts
  })

  return response.data.map(
    (item: { embedding: number[] }): number[] => item.embedding
  )
}

export function hashChunk(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(31, hash) + input.codePointAt(i)!
    hash = Math.trunc(hash)
  }
  return String(hash)
}

export async function replaceChunks(
  docId: string,
  rows: ChunkInsert[]
): Promise<void> {
  const { error: deleteError } = await retry(
    () => supabaseClient.from('rag_chunks').delete().eq('doc_id', docId),
    `delete chunks for doc ${docId}`
  )

  if (deleteError) {
    throw deleteError
  }

  if (rows.length === 0) {
    return
  }

  const { error: upsertError } = await retry(
    () =>
      supabaseClient
        .from('rag_chunks')
        .upsert(rows, { onConflict: 'doc_id,chunk_hash' }),
    `upsert chunks for doc ${docId}`
  )

  if (upsertError) {
    throw upsertError
  }
}

export function normalizeTimestamp(input: unknown): string | null {
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

export function extractPlainText(
  recordMap: ExtendedRecordMap,
  pageId: string
): string {
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

export function getPageTitle(
  recordMap: ExtendedRecordMap,
  pageId: string
): string {
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

export function getPageUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replaceAll('-', '')}`
}

export function getPageLastEditedTime(
  recordMap: ExtendedRecordMap,
  pageId: string
): string | null {
  const block = recordMap.block[pageId]?.value as {
    last_edited_time?: string | number
  } | null

  return normalizeTimestamp(block?.last_edited_time)
}

export type ExtractedArticle = {
  title: string
  text: string
  lastModified: string | null
}

export async function extractMainContent(
  url: string
): Promise<ExtractedArticle> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`
    )
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
      article?.textContent ?? dom.window.document.body?.textContent ?? ''

    const text = rawText
      .split('\n')
      .map(String.prototype.trim)
      .filter(Boolean)
      .join('\n\n')

    return { title, text, lastModified }
  } finally {
    dom.window.close()
  }
}