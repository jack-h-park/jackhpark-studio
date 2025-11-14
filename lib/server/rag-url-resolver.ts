import { host } from '@/lib/config'
import {
  type CanonicalPageLookup,
  normalizePageId,
  resolvePublicPageUrl} from '@/lib/server/page-url'

const DEBUG_RAG_URLS =
  (process.env.DEBUG_RAG_URLS ?? '').toLowerCase() === 'true'

type RagUrlCandidates = {
  docIdCandidates: Array<unknown>
  sourceUrlCandidates: Array<unknown>
  canonicalLookup: CanonicalPageLookup
  debugLabel?: string
  index?: number
}

type RagUrlResolution = {
  docId: string | null
  sourceUrl: string | null
}

export function resolveRagUrl({
  docIdCandidates,
  sourceUrlCandidates,
  canonicalLookup,
  debugLabel,
  index
}: RagUrlCandidates): RagUrlResolution {
  const docId = getNormalizedDocId(docIdCandidates)
  const canonicalUrl =
    docId !== null ? resolvePublicPageUrl(docId, canonicalLookup) : null
  const rawSourceUrl = getDocumentSourceUrl(sourceUrlCandidates)
  const resolvedSource =
    canonicalUrl ?? rewriteNotionUrl(rawSourceUrl, docId) ?? rawSourceUrl ?? null

  if (DEBUG_RAG_URLS) {
    console.log(`[${debugLabel ?? 'rag:url'}]`, {
      index,
      docId,
      sourceUrl: rawSourceUrl,
      canonicalUrl,
      rewrittenSource: resolvedSource
    })
  }

  return { docId, sourceUrl: resolvedSource }
}

function getNormalizedDocId(candidates: Array<unknown>): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue
    }

    const normalized = normalizePageId(candidate)

    if (normalized) {
      return normalized
    }
  }

  return null
}

function getDocumentSourceUrl(candidates: Array<unknown>): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue
    }

    const trimmed = candidate.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }

  return null
}

function rewriteNotionUrl(
  sourceUrl: string | null,
  docId: string | null
): string | null {
  const baseHost = host.replace(/\/+$/, '')

  if (!sourceUrl) {
    return docId ? `${baseHost}/${docId}` : null
  }

  const normalizedUrl = ensureAbsoluteUrl(sourceUrl)
  let parsed: URL

  try {
    parsed = new URL(normalizedUrl)
  } catch {
    return normalizedUrl
  }

  const hostname = parsed.hostname.toLowerCase()
  const derivedDocId =
    docId ??
    normalizePageId(parsed.pathname.split('/').findLast(Boolean) ?? null)

  if (
    derivedDocId &&
    (hostname.includes('notion.so') || hostname.includes('notion.site'))
  ) {
    const rewritten = `${baseHost}/${derivedDocId}`
    if (DEBUG_RAG_URLS) {
      console.log('[rag:url:fallback]', {
        sourceUrl,
        derivedDocId,
        rewritten
      })
    }
    return rewritten
  }

  return normalizedUrl
}

function ensureAbsoluteUrl(url: string): string {
  if (!url) {
    return url
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  return `https://${url.replace(/^\/+/, '')}`
}
