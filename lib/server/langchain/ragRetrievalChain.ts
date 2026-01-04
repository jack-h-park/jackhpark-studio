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
import { buildTelemetryConfigSnapshot } from "@/lib/server/telemetry/telemetry-config-snapshot";
import { buildTelemetryMetadata } from "@/lib/server/telemetry/telemetry-metadata";
import { buildSpanTiming, withSpan } from "@/lib/server/telemetry/withSpan";
import {
  DEFAULT_RERANK_K,
  type RankerMode,
  type ReverseRagMode,
} from "@/lib/shared/rag-config";

// Retrieval-stage minimum K (vector search limit). Defaults to 5 via env.
const RAG_TOP_K = Number(process.env.RAG_TOP_K || 5);

const EMBEDDING_ERROR_MESSAGE_LIMIT = 320;

function summarizeErrorMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? "unknown");
  return message.length > EMBEDDING_ERROR_MESSAGE_LIMIT
    ? `${message.slice(0, EMBEDDING_ERROR_MESSAGE_LIMIT)}…`
    : message;
}

function extractStatusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  if ("statusCode" in error && typeof (error as { statusCode?: unknown }).statusCode === "number") {
    return (error as { statusCode: number }).statusCode;
  }
  if ("status" in error && typeof (error as { status?: unknown }).status === "number") {
    return (error as { status: number }).status;
  }
  if ("code" in error && typeof (error as { code?: unknown }).code === "number") {
    return (error as { code: number }).code;
  }
  return null;
}

function extractErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") {
    return code;
  }
  if (typeof code === "number") {
    return String(code);
  }
  return null;
}

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
  requestId?: string | null;
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
    const allowPii = process.env.LANGFUSE_INCLUDE_PII === "true";
    const reverseRagMetadata = buildTelemetryMetadata({
      kind: "llm",
      requestId: input.requestId,
      generationProvider: input.provider,
      generationModel: input.llmModel,
      additional: {
        env: input.env,
        mode: input.reverseRagMode,
        stage: "reverse-rag",
        type: "reverse_rag",
      },
    });
    const runRewrite = () =>
      rewriteQuery(input.question, {
        enabled: input.reverseRagEnabled,
        mode: input.reverseRagMode,
        provider: input.provider,
        model: input.llmModel,
      });
    const rewrittenQuery =
      input.trace && input.reverseRagEnabled
        ? await withSpan(
            {
              trace: input.trace,
              requestId: input.requestId,
              name: "reverse_rag",
              input: allowPii ? input.question : undefined,
              metadata: reverseRagMetadata,
            },
            runRewrite,
            (result) => ({ output: allowPii ? result : undefined }),
          )
        : await runRewrite();

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
    const allowPii = process.env.LANGFUSE_INCLUDE_PII === "true";
    const hydeMetadata = buildTelemetryMetadata({
      kind: "llm",
      requestId: input.requestId,
      generationProvider: input.provider,
      generationModel: input.llmModel,
      additional: {
        env: input.env,
        enabled: input.hydeEnabled,
        stage: "hyde",
      },
    });
    const runHyde = () =>
      generateHydeDocument(input.rewrittenQuery, {
        enabled: input.hydeEnabled,
        provider: input.provider,
        model: input.llmModel,
      });
    const hydeDocument = input.trace
      ? await withSpan(
          {
            trace: input.trace,
            requestId: input.requestId,
            name: "hyde",
            input: allowPii ? input.rewrittenQuery : undefined,
            metadata: hydeMetadata,
          },
          runHyde,
          (result) => ({ output: allowPii ? result : undefined }),
        )
      : await runHyde();

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
    const emitRetrievalSpan = Boolean(
      input.trace && input.includeVerboseDetails,
    );
    const allowPii = process.env.LANGFUSE_INCLUDE_PII === "true";
    const configSnapshot = buildTelemetryConfigSnapshot(
      input.chatConfigSnapshot ?? null,
    );
    const retrievalBaseMetadata = buildTelemetryMetadata({
      kind: "retrieval",
      requestId: input.requestId,
      retrievalSource: "supabase",
      cache: { retrievalHit: input.cacheMeta.retrievalHit },
      additional: {
        env: input.env,
        stage: "retrieval",
        source: "supabase",
      },
    });
    const runRetrieval = async () => {
      const embedQueryWithLogging = async (): Promise<number[]> => {
        const provider = input.embeddingSelection.provider;
        const model = input.embeddingSelection.model;
        const embeddingSpaceId = input.embeddingSelection.embeddingSpaceId;
        const requestId = input.requestId ?? null;
        const attempt = 1;
        const basePayload = {
          provider,
          model,
          embeddingSpaceId,
          requestId,
          attempt,
        };
        ragLogger.debug("[embedding] start", basePayload);
        const startMs = Date.now();
        try {
          const embedding = await input.embeddings.embedQuery(
            input.embeddingTarget,
          );
          const tookMs = Date.now() - startMs;
          ragLogger.debug("[embedding] done", {
            ...basePayload,
            tookMs,
          });
          return embedding;
        } catch (err) {
          const tookMs = Date.now() - startMs;
          ragLogger.error("[embedding] error", {
            ...basePayload,
            tookMs,
            statusCode: extractStatusCode(err),
            code: extractErrorCode(err),
            messageSummary: summarizeErrorMessage(err),
          });
          throw err;
        }
      };
      const queryEmbedding = await embedQueryWithLogging();
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
          buildRetrievalTelemetryEntries(
            baseDocs,
            MAX_RETRIEVAL_TELEMETRY_ITEMS,
          ),
          {
            engine: "langchain",
            presetKey: input.chatConfigSnapshot?.presetKey,
            configSummary: configSnapshot.configSummary,
            configHash: configSnapshot.configHash,
            requestId: input.requestId,
          },
        );
      }

      const docIds = extractDocIdsFromBaseDocs(baseDocs);
      const metadataMap = await fetchRefinedMetadata(
        docIds,
        input.supabaseAdmin,
      );

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
            configSummary: configSnapshot.configSummary,
            configHash: configSnapshot.configHash,
            requestId: input.requestId,
          },
        );
      }

      const retrievalTelemetry = emitRetrievalSpan
        ? buildRetrievalTelemetryEntries(
            enrichedDocs,
            MAX_RETRIEVAL_TELEMETRY_ITEMS,
          )
        : [];

      return {
        queryEmbedding,
        enrichedDocs,
        retrieveK,
        finalK,
        candidatesRetrieved: matches.length,
        retrievalTelemetry,
      };
    };

    const retrievalResult = emitRetrievalSpan
      ? await withSpan(
          {
            trace: input.trace,
            requestId: input.requestId,
            name: "retrieval",
            input: allowPii ? input.preRetrieval.embeddingTarget : undefined,
            metadata: retrievalBaseMetadata,
          },
          runRetrieval,
          (result) => ({
            output: result.retrievalTelemetry,
            metadata: {
              ...retrievalBaseMetadata,
              cache: { retrievalHit: input.cacheMeta.retrievalHit },
              results: result.enrichedDocs.length,
            },
          }),
        )
      : await runRetrieval();

    return {
      ...input,
      queryEmbedding: retrievalResult.queryEmbedding,
      enrichedDocs: retrievalResult.enrichedDocs,
      retrieveK: retrievalResult.retrieveK,
      finalK: retrievalResult.finalK,
      candidatesRetrieved: retrievalResult.candidatesRetrieved,
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
    const emitRerankerSpan = Boolean(
      input.trace && input.includeVerboseDetails,
    );
    const rerankerBaseMetadata = buildTelemetryMetadata({
      kind: "reranker",
      requestId: input.requestId,
      cache: { retrievalHit: input.cacheMeta.retrievalHit },
      additional: {
        env: input.env,
        stage: "reranker",
        mode: input.rankerMode,
      },
    });

    const runReranker = async () => {
      const rankedDocs = await applyRanker(input.enrichedDocs, {
        mode: input.rankerMode,
        maxResults: rerankEnabled ? (rerankK ?? finalK) : finalK,
        embeddingSelection: input.embeddingSelection,
        queryEmbedding: input.queryEmbedding,
      });
      const rerankerInputTelemetry = emitRerankerSpan
        ? buildRetrievalTelemetryEntries(
            input.enrichedDocs,
            MAX_RETRIEVAL_TELEMETRY_ITEMS,
          )
        : [];
      const rerankerOutputTelemetry = emitRerankerSpan
        ? buildRetrievalTelemetryEntries(
            rankedDocs,
            MAX_RETRIEVAL_TELEMETRY_ITEMS,
          )
        : [];

      return {
        rankedDocs,
        rerankerInputTelemetry,
        rerankerOutputTelemetry,
      };
    };

    const rerankerResult = emitRerankerSpan
      ? await withSpan(
          {
            trace: input.trace,
            requestId: input.requestId,
            name: "reranker",
            metadata: rerankerBaseMetadata,
          },
          runReranker,
          (result) => ({
            input: result.rerankerInputTelemetry,
            output: result.rerankerOutputTelemetry,
            metadata: {
              ...rerankerBaseMetadata,
              cache: { retrievalHit: input.cacheMeta.retrievalHit },
              results: result.rankedDocs.length,
            },
          }),
        )
      : await runReranker();

    return { ...input, rankedDocs: rerankerResult.rankedDocs, finalK };
  }).withConfig({
    runName: makeRunName("rag", "rank"),
  });

  const contextWindowRunnable = RunnableLambda.from<
    RagChainState & { rankedDocs: EnrichedRetrievalItem<BaseRetrievalItem>[] },
    RagChainOutput
  >(async (input) => {
    // Context stage K: upper bound on selected chunks/citations (finalK).
    const spanStartMs = Date.now();
    let contextResult: ContextWindowResult | null = null;
    try {
      contextResult = buildContextWindow(input.rankedDocs, input.guardrails, {
        includeVerboseDetails: input.includeVerboseDetails,
        includeSelectionMetadata: input.includeSelectionMetadata,
      });
    } finally {
      if (
        input.trace &&
        input.includeSelectionMetadata &&
        contextResult?.selection
      ) {
        const { startTime, endTime } = buildSpanTiming({
          name: "context:selection",
          startMs: spanStartMs,
          endMs: Date.now(),
          requestId: input.requestId,
        });
        const metadata = buildTelemetryMetadata({
          kind: "selection",
          requestId: input.requestId,
          additional: {
            selectionUnit: contextResult.selection.selectionUnit,
            inputCount: contextResult.selection.inputCount,
            uniqueBeforeDedupe: contextResult.selection.uniqueBeforeDedupe,
            uniqueAfterDedupe: contextResult.selection.uniqueAfterDedupe,
            droppedByDedupe: contextResult.selection.droppedByDedupe,
            finalSelectedCount: contextResult.selection.finalSelectedCount,
            docInputCount: contextResult.selection.docSelection.inputCount,
            docUniqueBeforeDedupe:
              contextResult.selection.docSelection.uniqueBeforeDedupe,
            docUniqueAfterDedupe:
              contextResult.selection.docSelection.uniqueAfterDedupe,
            docDroppedByDedupe:
              contextResult.selection.docSelection.droppedByDedupe,
            quotaStart: contextResult.selection.quotaStart,
            quotaEnd: contextResult.selection.quotaEnd,
            quotaEndUsed: contextResult.selection.quotaEndUsed,
            droppedByQuota: contextResult.selection.droppedByQuota,
            uniqueDocs: contextResult.selection.uniqueDocs,
            mmrLite: contextResult.selection.mmrLite,
            mmrLambda: contextResult.selection.mmrLambda,
          },
        });
        void input.trace.observation({
          name: "context:selection",
          metadata,
          startTime,
          endTime,
        });
      }
    }
    if (!contextResult) {
      throw new Error("contextResult was not created");
    }
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
