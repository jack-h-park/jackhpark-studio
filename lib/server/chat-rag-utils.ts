import type { SupabaseClient } from "@supabase/supabase-js";

import type { RagRankingConfig } from "@/lib/server/admin-chat-config";
import type { RankerMode, ReverseRagMode } from "@/lib/shared/rag-config";
import { startDbQuery } from "@/lib/logging/db-logger";
import { ragLogger } from "@/lib/logging/logger";
import {
  normalizeMetadata,
  type RagDocumentMetadata,
} from "@/lib/rag/metadata";
import { computeMetadataWeight } from "@/lib/rag/ranking";
import { formatNotionPageId, normalizePageId } from "@/lib/server/page-url";
import {
  imageChunkVisualBoost,
  isImageChunk,
} from "@/lib/shared/visual-intent";

// --- Types ---

export type PreRetrievalResult = {
  rewrittenQuery: string;
  hydeDocument: string | null;
  embeddingTarget: string;
  enhancementSummary: {
    reverseRag: {
      enabled: boolean;
      mode: ReverseRagMode;
      original: string;
      rewritten: string;
    };
    hyde: {
      enabled: boolean;
      generated: string | null;
    };
    ranker: {
      mode: RankerMode;
    };
  };
};

export type BaseRetrievalItem = {
  docId: string | null;
  baseSimilarity: number;
  // Requires at least a generic metadata holder
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type EnrichedRetrievalItem<T extends BaseRetrievalItem> = T & {
  metadata: RagDocumentMetadata | null;
  similarity: number;
  metadata_weight: number;
  filteredOut?: boolean;
};

// --- Post-Retrieval Logic ---

export async function fetchRefinedMetadata(
  docIds: string[],
  supabase: SupabaseClient,
): Promise<Map<string, RagDocumentMetadata | null>> {
  let metadataRows: {
    doc_id?: string;
    metadata?: RagDocumentMetadata | null;
  }[] = [];

  if (docIds.length > 0) {
    const tracker = startDbQuery({
      action: "fetchRefinedMetadata",
      table: "rag_documents",
      operation: "select",
      correlationId: docIds[0],
    });
    const { data } = await supabase
      .from("rag_documents")
      .select("doc_id, metadata")
      .in("doc_id", docIds);
    if (data) {
      metadataRows = data as typeof metadataRows;
    }
    tracker.done({ rowCount: data?.length ?? 0 });
  }

  const metadataMap = new Map<string, RagDocumentMetadata | null>();
  for (const row of metadataRows) {
    if (typeof row.doc_id === "string") {
      const normalizedMeta = normalizeMetadata(
        row.metadata as RagDocumentMetadata,
      );
      metadataMap.set(row.doc_id, normalizedMeta);
      const normalizedId = normalizePageId(row.doc_id);
      if (normalizedId) {
        metadataMap.set(normalizedId, normalizedMeta);
      }
      const formatted = formatNotionPageId(row.doc_id);
      if (formatted) {
        metadataMap.set(formatted, normalizedMeta);
      }
    }
  }

  ragLogger.debug("[rag:common] metadataMap snapshot", {
    entries: Array.from(metadataMap.entries()).map(([docId, metadata]) => ({
      docId,
      doc_type: metadata?.doc_type ?? null,
      persona_type: metadata?.persona_type ?? null,
    })),
  });

  return metadataMap;
}

export function extractDocIdsFromBaseDocs(docs: BaseRetrievalItem[]): string[] {
  const docIdSet = new Set<string>();
  const addDocIdVariant = (value?: string | null) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    docIdSet.add(trimmed);
    const normalized = normalizePageId(trimmed);
    if (normalized) {
      docIdSet.add(normalized);
      const formatted = formatNotionPageId(normalized);
      if (formatted) {
        docIdSet.add(formatted);
      }
    }
  };

  for (const doc of docs) {
    addDocIdVariant(doc.docId);
    // Try to pluck from metadata if docId is null?
    // The BaseRetrievalItem should ideally have docId resolved by the caller,
    // but we can try generic metadata access just in case.
    if (!doc.docId && doc.metadata) {
      addDocIdVariant(doc.metadata.doc_id as string);
      addDocIdVariant(doc.metadata.docId as string);
      addDocIdVariant(doc.metadata.document_id as string);
      addDocIdVariant(doc.metadata.documentId as string);
    }
  }

  ragLogger.debug("[rag:common] docIdSet contents", Array.from(docIdSet));

  return Array.from(docIdSet).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}

export function enrichAndFilterDocs<T extends BaseRetrievalItem>(
  baseDocs: T[],
  metadataMap: Map<string, RagDocumentMetadata | null>,
  // Same shape computeMetadataWeight consumes; passed through from adminConfig.
  ragRanking: RagRankingConfig | null | undefined,
  options?: {
    /**
     * When the question asks for visuals, image-caption chunks get a weight
     * boost so the matching diagram/screenshot outranks nearby prose.
     */
    visualIntent?: boolean;
  },
): EnrichedRetrievalItem<T>[] {
  return (
    baseDocs
      .map((doc) => {
        // Resolve docId again just to be sure we match the map
        const docId =
          doc.docId ??
          (doc.metadata?.doc_id as string) ??
          (doc.metadata?.docId as string) ??
          null;

        const hydratedMeta =
          (docId ? (metadataMap.get(docId) ?? null) : null) ??
          normalizeMetadata(doc.metadata as RagDocumentMetadata) ??
          null;

        if (hydratedMeta?.is_public === false) {
          return {
            ...doc,
            filteredOut: true,
            metadata: hydratedMeta,
          } as unknown as EnrichedRetrievalItem<T>;
        }

        // Chunk-level keys (chunk_hash) live on doc.metadata; doc-level
        // refinements (image_chunks, doc_type, ...) come from hydratedMeta.
        const mergedMeta = {
          ...doc.metadata,
          ...hydratedMeta,
          doc_id: docId,
        } as RagDocumentMetadata;

        let weight = computeMetadataWeight(hydratedMeta ?? undefined, ragRanking);
        if (
          options?.visualIntent &&
          isImageChunk((doc as { chunk?: string }).chunk ?? null, mergedMeta)
        ) {
          weight *= imageChunkVisualBoost();
        }
        const finalScore = doc.baseSimilarity * weight;

        return {
          ...doc,
          metadata: mergedMeta,
          similarity: finalScore, // Override similarity with weighted score
          metadata_weight: weight,
          baseSimilarity: doc.baseSimilarity, // Keep original
          filteredOut: false,
        } as EnrichedRetrievalItem<T>;
      })
      .filter((doc) => doc.filteredOut !== true)
      // sort descending
      .toSorted((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
  );
}
