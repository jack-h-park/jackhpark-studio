import type { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";

import type { EmbeddingSpace } from "@/lib/core/embedding-spaces";
import type { AppEnv, LangfuseTrace } from "@/lib/langfuse";
import type { ChatConfigSnapshot } from "@/lib/rag/types";
import type { logDebugRag } from "@/lib/server/rag-logger";
import type { ModelProvider } from "@/lib/shared/model-provider";
import type { RagRankingConfig } from "@/types/chat-config";
import { ragLogger } from "@/lib/logging/logger";
import {
  buildRetrievalTelemetryEntries,
  logRetrievalStage,
  MAX_RETRIEVAL_TELEMETRY_ITEMS,
} from "@/lib/server/chat-common";
import {
  buildContextWindow,
  type ChatGuardrailConfig,
  type ContextWindowResult,
} from "@/lib/server/chat-guardrails";
import {
  type BaseRetrievalItem,
  enrichAndFilterDocs,
  type EnrichedRetrievalItem,
  extractDocIdsFromBaseDocs,
  fetchRefinedMetadata,
  type PreRetrievalResult,
} from "@/lib/server/chat-rag-utils";
import { makeRunName } from "@/lib/server/langchain/runnableConfig";
import {
  type CanonicalPageLookup,
  loadCanonicalPageLookup,
} from "@/lib/server/page-url";
import {
  applyRanker,
  generateHydeDocument,
  rewriteQuery,
} from "@/lib/server/rag-enhancements";
import { resolveRagUrl } from "@/lib/server/rag-url-resolver";
import {
  DEFAULT_RERANK_K,
  type RankerMode,
  type ReverseRagMode,
} from "@/lib/shared/rag-config";

// Retrieval-stage minimum K (vector search limit). Defaults to 5 via env.
const RAG_TOP_K = Number(process.env.RAG_TOP_K || 5);

type NormalizedRagK = {
  retrieveK: number;
  rerankK: number | null;
  finalK: number;
};

export function normalizeRagK(params: {
  retrieveK: number;
  rerankK?: number | null;
  finalK: number;
  rerankEnabled: boolean;
}): NormalizedRagK {
  if (!params.rerankEnabled) {
    const retrieveK = Math.max(params.retrieveK, params.finalK);
    const finalK = Math.min(params.finalK, retrieveK);
    return { retrieveK, rerankK: null, finalK };
  }

  const retrieveKBase = Math.max(params.retrieveK, params.finalK);
  const rerankKBase =
    typeof params.rerankK === "number"
      ? params.rerankK
      : Math.min(retrieveKBase, DEFAULT_RERANK_K);
  const retrieveK = Math.max(retrieveKBase, rerankKBase);
  const rerankK = Math.min(rerankKBase, retrieveK);
  const finalK = Math.min(params.finalK, rerankK);
  return { retrieveK, rerankK, finalK };
}

type RagChainInput = {
  guardrails: ChatGuardrailConfig;
  question: string;
  reverseRagEnabled: boolean;
  reverseRagMode: ReverseRagMode;
  hydeEnabled: boolean;
  rankerMode: RankerMode;
  provider: ModelProvider;
  llmModel: string;
  embeddingModel: string;
  embeddingSelection: EmbeddingSpace;
  embeddings: EmbeddingsInterface;
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
  tableName: string;
  queryName: string;
  chatConfigSnapshot?: ChatConfigSnapshot | null;
  includeVerboseDetails: boolean;
  includeSelectionMetadata?: boolean;
  trace: LangfuseTrace | null;
  env: AppEnv;
  logDebugRag?: typeof logDebugRag;
  ragRanking?: RagRankingConfig | null;
  cacheMeta: {
    retrievalHit: boolean | null;
  };
  candidateK: number;
  updateTrace?: (updates: { metadata: Record<string, unknown> }) => void;
};

type RagChainState = RagChainInput & {
  rewrittenQuery?: string;
  hydeDocument?: string | null;
  embeddingTarget?: string;
  preRetrieval?: PreRetrievalResult;
  queryEmbedding?: number[];
  retrieveK?: number;
  finalK?: number;
  candidatesRetrieved?: number;
  enrichedDocs?: EnrichedRetrievalItem<BaseRetrievalItem>[];
  rankedDocs?: EnrichedRetrievalItem<BaseRetrievalItem>[];
  contextResult?: ContextWindowResult;
};

type RagChainOutput = RagChainState & {
  contextResult: ContextWindowResult;
  preRetrieval: PreRetrievalResult;
  rankedDocs: EnrichedRetrievalItem<BaseRetrievalItem>[];
  enrichedDocs: EnrichedRetrievalItem<BaseRetrievalItem>[];
};

function rewriteLangchainDocument(
  doc: Document,
  canonicalLookup: CanonicalPageLookup,
  index: number,
): Document {
  const meta = doc.metadata ?? {};
  const { docId, sourceUrl } = resolveRagUrl({
    docIdCandidates: [
      meta.doc_id,
      meta.docId,
      meta.page_id,
      meta.pageId,
      meta.document_id,
      meta.documentId,
    ],
    sourceUrlCandidates: [meta.source_url, meta.sourceUrl, meta.url],
    canonicalLookup,
    debugLabel: "langchain_chat:url",
    index,
  });

  if (sourceUrl) {
    doc.metadata = {
      ...meta,
      doc_id: docId ?? meta.doc_id ?? null,
      source_url: sourceUrl,
    };
  }

  return doc;
}

export function buildRagRetrievalChain() {
  const reverseRagRunnable = RunnableLambda.from<
    RagChainInput,
    RagChainState & { rewrittenQuery: string }
  >(async (input) => {
    input.updateTrace?.({ metadata: { rag: { retrieval_attempted: true } } });
    const rewrittenQuery = await rewriteQuery(input.question, {
      enabled: input.reverseRagEnabled,
      mode: input.reverseRagMode,
      provider: input.provider,
      model: input.llmModel,
    });

    if (input.trace && input.reverseRagEnabled) {
      const allowPii = process.env.LANGFUSE_INCLUDE_PII === "true";
      void input.trace.observation({
        name: "reverse_rag",
        input: allowPii ? input.question : undefined,
        output: allowPii ? rewrittenQuery : undefined,
        metadata: {
          env: input.env,
          provider: input.provider,
          model: input.llmModel,
          mode: input.reverseRagMode,
          stage: "reverse-rag",
          type: "reverse_rag",
        },
      });
    }

    input.logDebugRag?.("reverse-query", {
      enabled: input.reverseRagEnabled,
      mode: input.reverseRagMode,
      original: input.question,
      rewritten: rewrittenQuery,
    });

    return { ...input, rewrittenQuery };
  }).withConfig({
    runName: makeRunName("rag", "reverseRag"),
  });

  const hydeRunnable = RunnableLambda.from<
    RagChainState & { rewrittenQuery: string },
    RagChainState & { embeddingTarget: string; hydeDocument: string | null }
  >(async (input) => {
    const hydeDocument = await generateHydeDocument(input.rewrittenQuery, {
      enabled: input.hydeEnabled,
      provider: input.provider,
      model: input.llmModel,
    });

    if (input.trace) {
      const allowPii = process.env.LANGFUSE_INCLUDE_PII === "true";
      void input.trace.observation({
        name: "hyde",
        input: allowPii ? input.rewrittenQuery : undefined,
        output: allowPii ? hydeDocument : undefined,
        metadata: {
          env: input.env,
          provider: input.provider,
          model: input.llmModel,
          enabled: input.hydeEnabled,
          stage: "hyde",
        },
      });
    }

    input.logDebugRag?.("hyde", {
      enabled: input.hydeEnabled,
      generated: hydeDocument,
    });

    const embeddingTarget = hydeDocument ?? input.rewrittenQuery;
    input.logDebugRag?.("retrieval", {
      query: embeddingTarget,
      mode: input.rankerMode,
    });

    const preRetrieval: PreRetrievalResult = {
      rewrittenQuery: input.rewrittenQuery,
      hydeDocument,
      embeddingTarget,
      enhancementSummary: {
        reverseRag: {
          enabled: input.reverseRagEnabled,
          mode: input.reverseRagMode,
          original: input.question,
          rewritten: input.rewrittenQuery,
        },
        hyde: {
          enabled: input.hydeEnabled,
          generated: hydeDocument,
        },
        ranker: {
          mode: input.rankerMode,
        },
      },
    };

    return { ...input, hydeDocument, embeddingTarget, preRetrieval };
  }).withConfig({
    runName: makeRunName("rag", "hyde"),
  });

  const weightedRetrievalRunnable = RunnableLambda.from<
    RagChainState & {
      embeddingTarget: string;
      preRetrieval: PreRetrievalResult;
    },
    RagChainState & {
      queryEmbedding: number[];
      enrichedDocs: EnrichedRetrievalItem<BaseRetrievalItem>[];
    }
  >(async (input) => {
    const queryEmbedding = await input.embeddings.embedQuery(
      input.embeddingTarget,
    );
    // Final K: upper bound on context/citations, from guardrails.ragTopK (>= 1).
    const finalKBase = Math.max(1, input.guardrails.ragTopK);
    // Retrieval stage K: vector search limit (candidate pool), normalized to >= rerank/final K.
    const retrieveKBase = Math.max(RAG_TOP_K, input.candidateK);
    const rerankEnabled = input.rankerMode !== "none";
    const { retrieveK, finalK } = normalizeRagK({
      retrieveK: retrieveKBase,
      rerankK: rerankEnabled ? undefined : null,
      finalK: finalKBase,
      rerankEnabled,
    });
    const store = new SupabaseVectorStore(input.embeddings, {
      client: input.supabase,
      tableName: input.tableName,
      queryName: input.queryName,
    });
    const matches = await store.similaritySearchVectorWithScore(
      queryEmbedding,
      retrieveK,
    );
    const canonicalLookup = await loadCanonicalPageLookup();
    const normalizedMatches = matches.map(([doc, score], index) => {
      const rewrittenDoc = rewriteLangchainDocument(
        doc,
        canonicalLookup,
        index,
      );
      return [rewrittenDoc, score] as (typeof matches)[number];
    });

    const baseDocs = normalizedMatches.map(([doc, score]) => {
      const baseSimilarity =
        typeof score === "number"
          ? score
          : typeof doc?.metadata?.similarity === "number"
            ? (doc.metadata.similarity as number)
            : 0;
      const docId =
        (doc.metadata?.doc_id as string | undefined) ??
        (doc.metadata?.docId as string | undefined) ??
        (doc.metadata?.document_id as string | undefined) ??
        (doc.metadata?.documentId as string | undefined) ??
        null;

      return {
        doc,
        chunk: doc.pageContent,
        docId,
        baseSimilarity,
        metadata: doc.metadata,
      };
    });

    ragLogger.debug(
      "[langchain_chat] baseDocs docId snapshot",
      baseDocs.map((entry) => ({
        docId: entry.docId,
        metadataDocId: entry.doc.metadata?.doc_id ?? null,
      })),
    );

    if (input.includeVerboseDetails && input.trace) {
      logRetrievalStage(
        input.trace,
        "raw_results",
        buildRetrievalTelemetryEntries(baseDocs, MAX_RETRIEVAL_TELEMETRY_ITEMS),
        {
          engine: "langchain",
          presetKey: input.chatConfigSnapshot?.presetKey,
          chatConfig: input.chatConfigSnapshot ?? undefined,
        },
      );
    }

    const docIds = extractDocIdsFromBaseDocs(baseDocs);
    const metadataMap = await fetchRefinedMetadata(docIds, input.supabaseAdmin);

    const enrichedDocs = enrichAndFilterDocs(
      baseDocs,
      metadataMap,
      input.ragRanking,
    );

    ragLogger.debug("[langchain_chat] retrieved urls", {
      urls: enrichedDocs.map((d) => d.metadata?.source_url).filter(Boolean),
    });

    if (input.includeVerboseDetails && input.trace) {
      logRetrievalStage(
        input.trace,
        "after_weighting",
        buildRetrievalTelemetryEntries(
          enrichedDocs,
          MAX_RETRIEVAL_TELEMETRY_ITEMS,
        ),
        {
          engine: "langchain",
          presetKey: input.chatConfigSnapshot?.presetKey,
          chatConfig: input.chatConfigSnapshot ?? undefined,
        },
      );
    }

    if (input.trace && input.includeVerboseDetails) {
      const allowPii = process.env.LANGFUSE_INCLUDE_PII === "true";
      const retrievalTelemetry = buildRetrievalTelemetryEntries(
        enrichedDocs,
        MAX_RETRIEVAL_TELEMETRY_ITEMS,
      );
      void input.trace.observation({
        name: "retrieval",
        input: allowPii ? input.preRetrieval.embeddingTarget : undefined,
        output: retrievalTelemetry,
        metadata: {
          env: input.env,
          provider: input.provider,
          model: input.llmModel,
          stage: "retrieval",
          source: "supabase",
          results: enrichedDocs.length,
          cache: {
            retrievalHit: input.cacheMeta.retrievalHit,
          },
        },
      });
    }

    return {
      ...input,
      queryEmbedding,
      enrichedDocs,
      retrieveK,
      finalK,
      candidatesRetrieved: matches.length,
    };
  }).withConfig({
    runName: makeRunName("rag", "retrieve"),
  });

  const rankerRunnable = RunnableLambda.from<
    RagChainState & {
      queryEmbedding: number[];
      enrichedDocs: EnrichedRetrievalItem<BaseRetrievalItem>[];
    },
    RagChainState & {
      rankedDocs: EnrichedRetrievalItem<BaseRetrievalItem>[];
    }
  >(async (input) => {
    // Rerank stage K: maxResults controls how many items the reranker outputs.
    const finalKBase = input.finalK ?? Math.max(1, input.guardrails.ragTopK);
    const retrieveKBase =
      input.retrieveK ?? Math.max(RAG_TOP_K, input.candidateK);
    const rerankEnabled = input.rankerMode !== "none";
    const { finalK, rerankK } = normalizeRagK({
      retrieveK: retrieveKBase,
      rerankK: rerankEnabled ? undefined : null,
      finalK: finalKBase,
      rerankEnabled,
    });
    const rankedDocs = await applyRanker(input.enrichedDocs, {
      mode: input.rankerMode,
      maxResults: rerankEnabled ? (rerankK ?? finalK) : finalK,
      embeddingSelection: input.embeddingSelection,
      queryEmbedding: input.queryEmbedding,
    });

    if (input.trace && input.includeVerboseDetails) {
      const rerankerInputTelemetry = buildRetrievalTelemetryEntries(
        input.enrichedDocs,
        MAX_RETRIEVAL_TELEMETRY_ITEMS,
      );
      const rerankerOutputTelemetry = buildRetrievalTelemetryEntries(
        rankedDocs,
        MAX_RETRIEVAL_TELEMETRY_ITEMS,
      );
      void input.trace.observation({
        name: "reranker",
        input: rerankerInputTelemetry,
        output: rerankerOutputTelemetry,
        metadata: {
          env: input.env,
          provider: input.provider,
          model: input.llmModel,
          mode: input.rankerMode,
          stage: "reranker",
          results: rankedDocs.length,
          cache: {
            retrievalHit: input.cacheMeta.retrievalHit,
          },
        },
      });
    }

    return { ...input, rankedDocs, finalK };
  }).withConfig({
    runName: makeRunName("rag", "rank"),
  });

  const contextWindowRunnable = RunnableLambda.from<
    RagChainState & { rankedDocs: EnrichedRetrievalItem<BaseRetrievalItem>[] },
    RagChainOutput
  >(async (input) => {
    // Context stage K: upper bound on selected chunks/citations (finalK).
    const contextResult = buildContextWindow(
      input.rankedDocs,
      input.guardrails,
      {
        includeVerboseDetails: input.includeVerboseDetails,
        includeSelectionMetadata: input.includeSelectionMetadata,
      },
    );
    const retrieveKBase =
      input.retrieveK ?? Math.max(RAG_TOP_K, input.candidateK);
    const finalKBase = input.finalK ?? Math.max(1, input.guardrails.ragTopK);
    const rerankEnabled = input.rankerMode !== "none";
    const { retrieveK, rerankK, finalK } = normalizeRagK({
      retrieveK: retrieveKBase,
      rerankK: rerankEnabled ? undefined : null,
      finalK: finalKBase,
      rerankEnabled,
    });
    const selectedCount = contextResult.included.length;
    const retrievalMetadata: Record<string, unknown> = {
      retrieve_k: retrieveK,
      final_k: finalK,
      candidates_retrieved:
        input.candidatesRetrieved ?? input.enrichedDocs?.length ?? 0,
      candidates_selected: selectedCount,
    };
    if (rerankEnabled) {
      retrievalMetadata.rerank_k = rerankK ?? finalK;
      retrievalMetadata.candidates_reranked = input.enrichedDocs?.length ?? 0;
    }
    input.updateTrace?.({ metadata: { rag: retrievalMetadata } });
    return {
      ...input,
      contextResult,
      enrichedDocs: input.enrichedDocs ?? [],
      rankedDocs: input.rankedDocs,
      preRetrieval: input.preRetrieval!,
    };
  }).withConfig({
    runName: makeRunName("rag", "compress"),
  });

  return RunnableSequence.from([
    reverseRagRunnable,
    hydeRunnable,
    weightedRetrievalRunnable,
    rankerRunnable,
    contextWindowRunnable,
  ]);
}
