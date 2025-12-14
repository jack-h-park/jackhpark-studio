import type { SupabaseClient } from "@supabase/supabase-js";

import type { RankerMode, ReverseRagMode } from "@/lib/shared/rag-config";
import { ragLogger } from "@/lib/logging/logger";
import {
  normalizeMetadata,
  type RagDocumentMetadata,
} from "@/lib/rag/metadata";
import { computeMetadataWeight } from "@/lib/rag/ranking";
import {
  formatNotionPageId,
  normalizePageId,
} from "@/lib/server/page-url";
import {
  generateHydeDocument,
  rewriteQuery,
} from "@/lib/server/rag-enhancements";

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

// --- Pre-Retrieval Logic ---

export async function processPreRetrieval(options: {
  question: string;
  reverseRagEnabled: boolean;
  reverseRagMode: ReverseRagMode;
  hydeEnabled: boolean;
  rankerMode: RankerMode;
  provider: any; // ModelProvider
  model: string;
  trace?: any; // Langfuse trace
  env?: any;
  logDebugRag?: (label: string, payload: any) => void;
}): Promise<PreRetrievalResult> {
  const {
    question,
    reverseRagEnabled,
    reverseRagMode,
    hydeEnabled,
    rankerMode,
    provider,
    model,
    trace,
    env,
    logDebugRag,
  } = options;

  // 1. Reverse RAG
  const rewrittenQuery = await rewriteQuery(question, {
    enabled: reverseRagEnabled,
    mode: reverseRagMode,
    provider,
    model,
  });

  if (trace && reverseRagEnabled) {
    void trace.observation({
      name: "reverse_rag",
      input: question,
      output: rewrittenQuery,
      metadata: {
        env,
        provider,
        model,
        mode: reverseRagMode,
        stage: "reverse-rag",
        type: "reverse_rag",
      },
    });
  }

  if (logDebugRag) {
    logDebugRag("reverse-query", {
      enabled: reverseRagEnabled,
      mode: reverseRagMode,
      original: question,
      rewritten: rewrittenQuery,
    });
  }

  // 2. Hyde
  const hydeDocument = await generateHydeDocument(rewrittenQuery, {
    enabled: hydeEnabled,
    provider,
    model,
  });

  if (trace) {
    void trace.observation({
      name: "hyde",
      input: rewrittenQuery,
      output: hydeDocument,
      metadata: {
        env,
        provider,
        model,
        enabled: hydeEnabled,
        stage: "hyde",
      },
    });
  }
  if (logDebugRag) {
    logDebugRag("hyde", {
      enabled: hydeEnabled,
      generated: hydeDocument,
    });
  }

  // 3. Selection
  const embeddingTarget = hydeDocument ?? rewrittenQuery;

  if (logDebugRag) {
    logDebugRag("retrieval", {
      query: embeddingTarget,
      mode: rankerMode,
    });
  }

  return {
    rewrittenQuery,
    hydeDocument,
    embeddingTarget,
    enhancementSummary: {
      reverseRag: {
        enabled: reverseRagEnabled,
        mode: reverseRagMode,
        original: question,
        rewritten: rewrittenQuery,
      },
      hyde: {
        enabled: hydeEnabled,
        generated: hydeDocument,
      },
      ranker: {
        mode: rankerMode,
      },
    },
  };
}

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
    const { data } = await supabase
      .from("rag_documents")
      .select("doc_id, metadata")
      .in("doc_id", docIds);
    if (data) {
      metadataRows = data as any;
    }
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
  ragRanking: any, // passed from adminConfig
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

        const weight = computeMetadataWeight(
          hydratedMeta ?? undefined,
          ragRanking,
        );
        const finalScore = doc.baseSimilarity * weight;

        return {
          ...doc,
          metadata: {
            ...doc.metadata,
            ...hydratedMeta,
            doc_id: docId,
          },
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
