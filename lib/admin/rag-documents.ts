import { normalizeTimestamp } from "@/lib/rag";
import {
  mergeMetadata,
  normalizeMetadata,
  DOC_TYPE_OPTIONS,
  type RagDocumentMetadata,
} from "@/lib/rag/metadata";

export type RagDocumentRecord = {
  doc_id: string;
  source_url: string | null;
  last_ingested_at: string | null;
  last_source_update: string | null;
  chunk_count: number | null;
  total_characters: number | null;
  metadata: RagDocumentMetadata | null;
};

export function normalizeRagDocument(input: unknown): RagDocumentRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  const docId = typeof record.doc_id === "string" ? record.doc_id : null;
  if (!docId) {
    return null;
  }

  const metadata = normalizeMetadata(
    record.metadata as RagDocumentMetadata | null | undefined,
  );

  return {
    doc_id: docId,
    source_url:
      typeof record.source_url === "string" ? record.source_url : null,
    last_ingested_at: normalizeTimestamp(record.last_ingested_at ?? null),
    last_source_update: normalizeTimestamp(record.last_source_update ?? null),
    chunk_count:
      typeof record.chunk_count === "number" ? record.chunk_count : null,
    total_characters:
      typeof record.total_characters === "number"
        ? record.total_characters
        : null,
    metadata: metadata ?? null,
  };
}

export function mergeDocumentMetadata(
  existing: RagDocumentMetadata | null | undefined,
  incoming: RagDocumentMetadata | null | undefined,
): RagDocumentMetadata | null {
  return mergeMetadata(existing, incoming);
}

export type RagDocumentStats = {
  total: number;
  byDocType: Record<string, number>;
  publicCount: number;
  privateCount: number;
};

export function computeDocumentStats(
  documents: RagDocumentRecord[],
): RagDocumentStats {
  const byDocType: Record<string, number> = {};
  let publicCount = 0;
  let privateCount = 0;

  for (const doc of documents) {
    const docType = doc.metadata?.doc_type;
    if (docType) {
      byDocType[docType] = (byDocType[docType] ?? 0) + 1;
    } else {
      byDocType.unknown = (byDocType.unknown ?? 0) + 1;
    }

    if (doc.metadata?.is_public === true) {
      publicCount += 1;
    } else if (doc.metadata?.is_public === false) {
      privateCount += 1;
    }
  }

  // Ensure known doc types appear even if zero, for stable display ordering.
  for (const option of DOC_TYPE_OPTIONS) {
    if (!(option in byDocType)) {
      byDocType[option] = 0;
    }
  }

  return {
    total: documents.length,
    byDocType,
    publicCount,
    privateCount,
  };
}
