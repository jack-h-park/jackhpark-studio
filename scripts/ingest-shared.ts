import { loadEnvConfig } from '@next/env'
import {
  createClient,
  type PostgrestError,
  type SupabaseClient
} from '@supabase/supabase-js'
import { encode } from 'gpt-tokenizer'
import OpenAI from 'openai'

loadEnvConfig(process.cwd())

const required = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY
}

for (const [key, value] of Object.entries(required)) {
  if (!value) {
    throw new Error(`Missing required environment variable "${key}"`)
  }
}

const supabaseClient: SupabaseClient = createClient(
  required.SUPABASE_URL!,
  required.SUPABASE_SERVICE_ROLE_KEY!
)

const openai = new OpenAI({ apiKey: required.OPENAI_API_KEY! })

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
}

export type DocumentState = {
  doc_id: string
  source_url: string
  content_hash: string
  last_ingested_at: string
  last_source_update: string | null
}

export type DocumentStateUpsert = {
  doc_id: string
  source_url: string
  content_hash: string
  last_source_update?: string | null
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
      'doc_id, source_url, content_hash, last_ingested_at, last_source_update'
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
        : toUpsert.last_source_update
  }

  const { error } = await supabaseClient
    .from(DOCUMENTS_TABLE)
    .upsert(payload, { onConflict: 'doc_id' })

  if (error) {
    if (handleDocumentStateError(error)) {
      return
    }
    throw error
  }

  documentStateTableStatus = 'available'
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
    model: 'text-embedding-3-small',
    input: texts
  })

  return response.data.map((item) => item.embedding)
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
  const { error: deleteError } = await supabaseClient
    .from('rag_chunks')
    .delete()
    .eq('doc_id', docId)

  if (deleteError) {
    throw deleteError
  }

  if (rows.length === 0) {
    return
  }

  const { error: upsertError } = await supabaseClient
    .from('rag_chunks')
    .upsert(rows, { onConflict: 'doc_id,chunk_hash' })

  if (upsertError) {
    throw upsertError
  }
}

export { openai, supabaseClient }
