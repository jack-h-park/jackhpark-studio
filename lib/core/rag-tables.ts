import type { ModelProvider } from '@/lib/shared/model-provider'
import { normalizeEmbeddingProvider } from '@/lib/core/model-provider'

const RAG_CHUNK_TABLES: Record<ModelProvider, string> = {
  openai: 'rag_chunks_openai',
  gemini: 'rag_chunks_gemini',
  huggingface: 'rag_chunks_hf'
}

const LC_CHUNK_VIEWS: Record<ModelProvider, string> = {
  openai: 'lc_chunks_openai',
  gemini: 'lc_chunks_gemini',
  huggingface: 'lc_chunks_hf'
}

const RAG_MATCH_FUNCTIONS: Record<ModelProvider, string> = {
  openai: 'match_rag_chunks_openai',
  gemini: 'match_rag_chunks_gemini',
  huggingface: 'match_rag_chunks_hf'
}

const LC_MATCH_FUNCTIONS: Record<ModelProvider, string> = {
  openai: 'match_lc_chunks_openai',
  gemini: 'match_lc_chunks_gemini',
  huggingface: 'match_lc_chunks_hf'
}

export function getRagChunksTable(provider?: string | null): string {
  const normalized = normalizeEmbeddingProvider(provider)
  return RAG_CHUNK_TABLES[normalized]
}

export function getLcChunksView(provider?: string | null): string {
  const normalized = normalizeEmbeddingProvider(provider)
  return LC_CHUNK_VIEWS[normalized]
}

export function getRagMatchFunction(provider?: string | null): string {
  const normalized = normalizeEmbeddingProvider(provider)
  return RAG_MATCH_FUNCTIONS[normalized]
}

export function getLcMatchFunction(provider?: string | null): string {
  const normalized = normalizeEmbeddingProvider(provider)
  return LC_MATCH_FUNCTIONS[normalized]
}
