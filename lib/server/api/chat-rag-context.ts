import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmbeddingSpace } from "@/lib/core/embedding-spaces";
import type { AppEnv, LangfuseTrace } from "@/lib/langfuse";
import type { buildChatConfigSnapshot } from "@/lib/rag/telemetry";
import type {
  GuardrailEnhancements,
  GuardrailMeta,
} from "@/lib/shared/guardrail-meta";
import type { ModelProvider } from "@/lib/shared/model-provider";
import type { RankerMode, ReverseRagMode } from "@/lib/shared/rag-config";
import type {
  RagAutoMode,
  RagMultiQueryMode,
  RagRankingConfig,
} from "@/types/chat-config";
import { ragLogger } from "@/lib/logging/logger";
import {
  buildRetrievalCacheKey,
  type RagDecisionSignature,
  type RetrievalCacheKeyArgs,
} from "@/lib/server/api/chat-cache-keys";
import { hashPayload, type memoryCacheClient } from "@/lib/server/chat-cache";
import {
  buildContextWindow,
  buildIntentContextFallback,
  type ChatGuardrailConfig,
  type ContextWindowResult,
  estimateTokens,
  type HistoryWindowResult,
  type NormalizedQuestion,
  normalizeQuestion,
  type RoutedQuestion,
} from "@/lib/server/chat-guardrails";
import {
  mergeCandidates,
  pickAltQueryType,
} from "@/lib/server/langchain/multi-query";
import { buildRagRetrievalChain } from "@/lib/server/langchain/ragRetrievalChain";
import {
  buildChainRunnableConfig,
  type ChainRunContext,
  makeRunName,
} from "@/lib/server/langchain/runnableConfig";
import {
  type AutoDecisionMetrics,
  AutoPassTimeoutError,
  buildFailedAutoMetrics,
  buildPassMetrics,
  evaluateAutoTrigger,
  isWeakRetrieval,
  type RagDecisionTelemetry,
  resolveAutoCapability,
  selectBetterRetrieval,
  shouldSuppressAuto,
} from "@/lib/server/rag/auto-rag-decision";
import { logDebugRag } from "@/lib/server/rag-logger";
import { computeRetrievalUsed } from "@/lib/server/telemetry/langfuse-metadata";
import { emitRagScores } from "@/lib/server/telemetry/langfuse-scores";
import { buildTelemetryMetadata } from "@/lib/server/telemetry/telemetry-metadata";
import {
  applyTraceMetadataMerge,
  type ResponseCacheMeta,
  type TraceMetadataSnapshot,
  type TraceUpdate,
} from "@/lib/server/telemetry/trace-metadata-merge";
import { buildSpanTiming } from "@/lib/server/telemetry/withSpan";
import {
  buildCitationPayload,
  type CitationPayload,
} from "@/lib/types/citation";

const AUTO_PASS_TIMEOUT_MS = 2000;
const MULTI_QUERY_TIMEOUT_MS = 1200;

export interface RagExecutionFlags {
  reverseRagEnabled: boolean;
  reverseRagMode: ReverseRagMode;
  hydeEnabled: boolean;
  hydeMode: RagAutoMode;
  rewriteMode: RagAutoMode;
  ragMultiQueryMode: RagMultiQueryMode;
  ragMultiQueryMaxQueries: number;
  rankerMode: RankerMode;
  ragRanking?: RagRankingConfig | null;
}

export interface RagInfrastructure {
  embeddings: EmbeddingsInterface;
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
  tableName: string;
  queryName: string;
  memoryCacheClient: typeof memoryCacheClient;
  retrievalCacheTtl: number;
}

export interface RagTelemetryCallbacks {
  trace?: LangfuseTrace | null;
  updateTrace?: (updates: TraceUpdate) => void;
  updateTraceCacheMetadata?: () => void;
  updateRetrievalMetadata?: (attempted: boolean, used: boolean) => void;
  traceMetadata: TraceMetadataSnapshot | undefined;
  cacheMeta: ResponseCacheMeta;
}

export interface ComputeRagContextParams {
  request: {
    guardrails: ChatGuardrailConfig;
    normalizedQuestion: NormalizedQuestion;
    routingDecision: RoutedQuestion;
    historyWindow: HistoryWindowResult;
    presetId: string;
  };
  runtime: {
    provider: ModelProvider;
    llmModel: string;
    embeddingModel: string;
    embeddingSelection: EmbeddingSpace;
    chatConfigSnapshot: ReturnType<typeof buildChatConfigSnapshot> | undefined;
    includeVerboseDetails: boolean;
    includeSelectionTelemetry: boolean;
    env: AppEnv;
    abortSignal?: AbortSignal | null;
    chainRunContext: ChainRunContext;
    markStage: (stage: string, extra?: Record<string, unknown>) => void;
    safeMode: boolean;
    forcedFlags?: { reverseRag?: boolean; hyde?: boolean };
    ragFlags: RagExecutionFlags;
  };
  infra: RagInfrastructure;
  telemetry: RagTelemetryCallbacks;
}

export interface ComputeRagContextResult {
  contextResult: ContextWindowResult;
  citations: CitationPayload;
  latestMeta: GuardrailMeta;
  enhancementSummary: GuardrailEnhancements;
  decisionSignature?: RagDecisionSignature;
  decisionTelemetry?: RagDecisionTelemetry;
  retrievalLatencyMs: number | null;
}

export async function computeRagContextAndCitations({
  request: {
    guardrails,
    normalizedQuestion: initialNormalizedQuestion,
    routingDecision,
    historyWindow,
    presetId,
  },
  runtime: {
    provider,
    llmModel,
    embeddingModel,
    embeddingSelection,
    chatConfigSnapshot,
    includeVerboseDetails,
    includeSelectionTelemetry,
    env,
    abortSignal,
    chainRunContext,
    markStage,
    safeMode = false,
    forcedFlags,
    ragFlags: {
      reverseRagEnabled,
      reverseRagMode,
      hydeEnabled,
      hydeMode,
      rewriteMode,
      ragMultiQueryMode,
      ragMultiQueryMaxQueries,
      rankerMode,
      ragRanking,
    },
  },
  infra: {
    embeddings,
    supabase,
    supabaseAdmin,
    tableName,
    queryName,
    memoryCacheClient,
    retrievalCacheTtl,
  },
  telemetry: {
    trace = null,
    updateTrace,
    updateTraceCacheMetadata,
    updateRetrievalMetadata,
    traceMetadata: _traceMetadata,
    cacheMeta,
  },
}: ComputeRagContextParams): Promise<ComputeRagContextResult> {
  const normalizedQuestion = normalizeQuestion(
    typeof routingDecision.question === "string"
      ? routingDecision.question
      : initialNormalizedQuestion.normalized,
  );
  let contextResult = buildIntentContextFallback(
    routingDecision.intent,
    guardrails,
  );
  let citationPayload: CitationPayload | null = null;
  let topKChunks = guardrails.ragTopK;
  let retrievalCacheKey: string | null = null;
  let retrievalCacheWriteKey: string | null = null;
  let enhancementSummary: GuardrailEnhancements = {
    reverseRag: {
      enabled: reverseRagEnabled,
      mode: reverseRagMode,
      original: normalizedQuestion.normalized,
      rewritten: normalizedQuestion.normalized,
    },
    hyde: {
      enabled: hydeEnabled,
      generated: null,
    },
    ranker: {
      mode: rankerMode,
    },
  };
  let autoDecisionMetrics: AutoDecisionMetrics | undefined;
  let decisionSignature: RagDecisionSignature | undefined;
  let decisionTelemetry: RagDecisionTelemetry | undefined;
  let retrievalLatencyMs: number | null = null;

  if (routingDecision.intent === "knowledge" && !safeMode) {
    const finalK = guardrails.ragTopK;
    const CANDIDATE_MULTIPLIER = 5;
    const CANDIDATE_MIN = 20;
    const CANDIDATE_MAX = 80;
    const candidateK = Math.max(
      CANDIDATE_MIN,
      Math.min(CANDIDATE_MAX, finalK * CANDIDATE_MULTIPLIER),
    );
    const reverseRagDecision = resolveAutoCapability(
      rewriteMode,
      reverseRagEnabled,
    );
    const hydeDecision = resolveAutoCapability(hydeMode, hydeEnabled);
    if (retrievalCacheTtl > 0) {
      const retrievalCacheArgs: RetrievalCacheKeyArgs = {
        question: normalizedQuestion.normalized,
        presetId,
        ragTopK: guardrails.ragTopK,
        similarityThreshold: guardrails.similarityThreshold,
        candidateK,
        reverseRagEnabled: reverseRagDecision.capabilityEnabled,
        reverseRagMode,
        hydeEnabled: hydeDecision.capabilityEnabled,
        rankerMode,
        hydeMode,
        rewriteMode,
        ragMultiQueryMode,
        ragMultiQueryMaxQueries,
      };
      retrievalCacheKey = buildRetrievalCacheKey(retrievalCacheArgs);
      retrievalCacheWriteKey = retrievalCacheKey;
      const cachedContext =
        await memoryCacheClient.get<ContextWindowResult>(retrievalCacheKey);
      if (cachedContext) {
        cacheMeta.retrievalHit = true;
        contextResult = cachedContext;
        updateTraceCacheMetadata?.();
        const cachedRetrievalUsed =
          computeRetrievalUsed({
            intent: routingDecision.intent,
            retrievedCount:
              cachedContext.included.length + cachedContext.dropped,
            finalSelectedCount:
              cachedContext.selection?.finalSelectedCount ?? null,
          }) ?? false;
        updateRetrievalMetadata?.(false, cachedRetrievalUsed);
      }
    }

    if (cacheMeta.retrievalHit === true) {
      logDebugRag("retrieval-cache", {
        hit: true,
        presetId,
        finalK: guardrails.ragTopK,
        candidateK,
        similarityThreshold: guardrails.similarityThreshold,
      });
    } else {
      logDebugRag("retrieval-cache", {
        hit: false,
        presetId,
        finalK: guardrails.ragTopK,
        candidateK,
        similarityThreshold: guardrails.similarityThreshold,
      });
      const ragRootStartMs = Date.now();
      let ragRootMetadata: Record<string, unknown> | null = null;
      try {
        const runRetrieval = async (
          flags: { reverseRagEnabled: boolean; hydeEnabled: boolean },
          stageLabel: string,
        ) => {
          markStage?.(stageLabel);
          const ragChain = buildRagRetrievalChain();
          const ragChainRunnableConfig = buildChainRunnableConfig({
            ...chainRunContext,
            stage: "rag",
          });
          return ragChain.invoke(
            {
              guardrails,
              question: normalizedQuestion.normalized,
              requestId: chainRunContext.requestId ?? null,
              reverseRagEnabled: flags.reverseRagEnabled,
              reverseRagMode,
              hydeEnabled: flags.hydeEnabled,
              rankerMode,
              provider,
              llmModel,
              embeddingModel,
              embeddingSelection,
              embeddings,
              supabase,
              supabaseAdmin,
              tableName,
              queryName,
              chatConfigSnapshot,
              includeVerboseDetails,
              includeSelectionMetadata: includeSelectionTelemetry,
              trace,
              env,
              logDebugRag,
              ragRanking,
              cacheMeta,
              candidateK,
              updateTrace: updateTrace ?? undefined,
            },
            {
              ...ragChainRunnableConfig,
              runName: makeRunName("rag", "root"),
              signal: abortSignal ?? undefined,
            },
          );
        };

        const baseFlags = {
          reverseRagEnabled: forcedFlags?.reverseRag ?? false,
          hydeEnabled: forcedFlags?.hyde ?? false,
        };
        const baseStart = Date.now();
        const baseResult = await runRetrieval(baseFlags, "before-rag-retrieve");
        const baseMetrics = buildPassMetrics(
          "base",
          baseResult.contextResult,
          baseFlags.hydeEnabled,
          baseFlags.reverseRagEnabled,
          Date.now() - baseStart,
        );
        const multiQueryEnabled =
          ragMultiQueryMode === "auto" && ragMultiQueryMaxQueries >= 2;
        const autoPassTimeoutMs = multiQueryEnabled
          ? Math.min(AUTO_PASS_TIMEOUT_MS, MULTI_QUERY_TIMEOUT_MS)
          : AUTO_PASS_TIMEOUT_MS;
        autoDecisionMetrics = {
          enabledHydeMode: hydeMode,
          enabledRewriteMode: rewriteMode,
          enabledMultiQueryMode: ragMultiQueryMode,
          autoTriggered: false,
          winner: "base",
          base: baseMetrics,
        };
        let selectedResult = baseResult;
        let autoWinner: "base" | "auto" = "base";
        let autoResult: typeof baseResult | null = null;
        let autoFailureReason: "timeout" | "error" | null = null;
        const baseWeak = isWeakRetrieval(
          baseResult.contextResult,
          guardrails.similarityThreshold,
          finalK,
        );
        const suppressAuto = shouldSuppressAuto(guardrails);
        // Auto Trigger Logic
        const { shouldAutoRewrite, shouldAutoHyde } = evaluateAutoTrigger({
          forcedFlags,
          reverseRagDecision,
          hydeDecision,
          baseWeak,
          suppressAuto,
        });

        if ((shouldAutoRewrite || shouldAutoHyde) && !abortSignal?.aborted) {
          const autoFlags = {
            reverseRagEnabled: shouldAutoRewrite
              ? true
              : baseFlags.reverseRagEnabled,
            hydeEnabled: shouldAutoHyde ? true : baseFlags.hydeEnabled,
          };
          autoDecisionMetrics.autoTriggered = true;
          const autoStart = Date.now();
          autoResult = null;
          let timeoutId: ReturnType<typeof setTimeout> | null = null;
          try {
            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutId = setTimeout(
                () => reject(new AutoPassTimeoutError()),
                autoPassTimeoutMs,
              );
            });
            autoResult = await Promise.race([
              runRetrieval(autoFlags, "auto-rag-retrieve"),
              timeoutPromise,
            ]);
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            const autoMetrics = buildPassMetrics(
              "auto",
              autoResult.contextResult,
              autoFlags.hydeEnabled,
              autoFlags.reverseRagEnabled,
              Date.now() - autoStart,
            );
            autoDecisionMetrics.auto = autoMetrics;
            autoWinner = selectBetterRetrieval(
              baseResult.contextResult,
              autoResult.contextResult,
            );
            selectedResult = autoWinner === "auto" ? autoResult : baseResult;
          } catch (err) {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            if (err instanceof AutoPassTimeoutError) {
              autoFailureReason = "timeout";
              autoDecisionMetrics.auto = buildFailedAutoMetrics(
                autoFlags.hydeEnabled,
                autoFlags.reverseRagEnabled,
                Date.now() - autoStart,
              );
            } else if (abortSignal?.aborted) {
              throw err;
            } else {
              autoFailureReason = "error";
              autoDecisionMetrics.auto = buildFailedAutoMetrics(
                autoFlags.hydeEnabled,
                autoFlags.reverseRagEnabled,
                Date.now() - autoStart,
              );
            }
            autoWinner = "base";
            selectedResult = baseResult;
          }
          autoDecisionMetrics.winner = autoWinner;
        }

        const altQueryType = pickAltQueryType({
          firedRewrite: shouldAutoRewrite,
          firedHyde: shouldAutoHyde,
          rewriteQuery: autoResult?.preRetrieval?.rewrittenQuery,
          hydeQuery: autoResult?.preRetrieval?.embeddingTarget,
        });
        let skippedReason:
          | "not_enabled"
          | "not_weak"
          | "no_alt"
          | "aborted"
          | "timeout"
          | "error"
          | undefined;
        if (!multiQueryEnabled) {
          skippedReason = "not_enabled";
        } else if (!baseWeak) {
          skippedReason = "not_weak";
        } else if (altQueryType === "none") {
          skippedReason = "no_alt";
        } else if (abortSignal?.aborted) {
          skippedReason = "aborted";
        } else if (!autoResult) {
          skippedReason = autoFailureReason ?? "error";
        }
        let altQueryHash: string | null = null;
        const shouldRunMultiQuery =
          multiQueryEnabled &&
          baseWeak &&
          altQueryType !== "none" &&
          autoResult &&
          !abortSignal?.aborted;

        if (autoDecisionMetrics) {
          autoDecisionMetrics.multiQuery = {
            enabled: multiQueryEnabled,
            ran: false,
            altType: altQueryType,
            altQueryHash,
            mergedCandidates: baseResult.rankedDocs.length,
            baseCandidates: baseResult.rankedDocs.length,
            altCandidates: autoResult?.rankedDocs?.length ?? 0,
            tookMsAlt: autoDecisionMetrics.auto?.tookMs,
            skippedReason,
          };
        }

        if (shouldRunMultiQuery && autoResult) {
          altQueryHash = hashPayload({
            altType: altQueryType,
            query: autoResult.preRetrieval.embeddingTarget,
          });
          const mergedCandidates = mergeCandidates(
            baseResult.rankedDocs,
            autoResult.rankedDocs,
          );
          const mergedContext = buildContextWindow(
            mergedCandidates,
            guardrails,
            {
              includeVerboseDetails,
              includeSelectionMetadata: includeSelectionTelemetry,
            },
          );
          contextResult = mergedContext;
          if (autoDecisionMetrics?.multiQuery) {
            autoDecisionMetrics.multiQuery = {
              ...autoDecisionMetrics.multiQuery,
              ran: true,
              mergedCandidates: mergedCandidates.length,
              baseCandidates: baseResult.rankedDocs.length,
              altCandidates: autoResult.rankedDocs.length,
              altQueryHash,
            };
          }
        } else {
          contextResult = selectedResult.contextResult;
        }

        const autoOrMultiEnabled =
          hydeMode === "auto" ||
          rewriteMode === "auto" ||
          ragMultiQueryMode === "auto";
        let altQueryHashForDecision: string | null = null;
        if (autoOrMultiEnabled && altQueryType !== "none" && autoResult) {
          const altQuery =
            altQueryType === "rewrite"
              ? autoResult.preRetrieval.rewrittenQuery
              : autoResult.preRetrieval.embeddingTarget;
          altQueryHashForDecision = altQuery
            ? hashPayload({ q: altQuery })
            : null;
        }
        if (autoOrMultiEnabled && autoDecisionMetrics) {
          decisionSignature = {
            autoTriggered: autoDecisionMetrics.autoTriggered,
            winner: autoDecisionMetrics.winner,
            altType: autoDecisionMetrics.multiQuery?.altType ?? "none",
            multiQueryRan: autoDecisionMetrics.multiQuery?.ran ?? false,
            altQueryHash: altQueryHashForDecision,
          };
        }
        decisionTelemetry = autoDecisionMetrics
          ? {
              autoTriggered: autoDecisionMetrics.autoTriggered,
              winner: autoDecisionMetrics.winner,
              altType: autoDecisionMetrics.multiQuery?.altType ?? "none",
              multiQueryRan: autoDecisionMetrics.multiQuery?.ran ?? false,
              skippedReason: autoDecisionMetrics.multiQuery?.skippedReason,
              reason:
                forcedFlags?.reverseRag || forcedFlags?.hyde
                  ? "forced"
                  : "weak_signal",
            }
          : undefined;

        if (autoDecisionMetrics && includeVerboseDetails) {
          ragLogger.debug(
            "[langchain_chat] rag auto decision",
            autoDecisionMetrics,
          );
        }

        enhancementSummary = selectedResult.preRetrieval.enhancementSummary;
        const droppedCount = contextResult.dropped ?? 0;
        const retrievedCount = contextResult.included.length + droppedCount;
        const retrievalUsed =
          computeRetrievalUsed({
            intent: routingDecision.intent,
            retrievedCount,
            finalSelectedCount:
              contextResult.selection?.finalSelectedCount ?? null,
          }) ?? false;
        updateRetrievalMetadata?.(true, retrievalUsed);
        topKChunks = Math.max(finalK, retrievedCount);
        citationPayload = buildCitationPayload(contextResult.included, {
          topKChunks,
          ragRanking,
        });
        if (retrievalCacheWriteKey) {
          await memoryCacheClient.set(
            retrievalCacheWriteKey,
            contextResult,
            retrievalCacheTtl,
          );
          cacheMeta.retrievalHit = false;
          updateTraceCacheMetadata?.();
        }
        ragRootMetadata = {
          finalK,
          candidateK,
          topKChunks,
          similarityThreshold: guardrails.similarityThreshold,
          retrievedCount,
          droppedCount,
          highestScore: Number(contextResult.highestScore.toFixed(3)),
          includedCount: contextResult.included.length,
          insufficient: contextResult.insufficient,
          autoTriggered: decisionSignature?.autoTriggered ?? false,
          winner: decisionSignature?.winner ?? null,
          multiQueryRan: decisionSignature?.multiQueryRan ?? false,
        };
        ragLogger.debug("[langchain_chat] context compression", {
          finalK,
          topKChunks,
          candidateK,
          retrieved: retrievedCount,
          ranked: retrievedCount,
          included: contextResult.included.length,
          dropped: droppedCount,
          totalTokens: contextResult.totalTokens,
          highestScore: Number(contextResult.highestScore.toFixed(3)),
          insufficient: contextResult.insufficient,
          rankerMode,
          similarityThreshold: guardrails.similarityThreshold,
        });
        if (includeVerboseDetails && contextResult.selection) {
          ragLogger.debug("[langchain_chat] context selection", {
            finalK,
            quotaStart: contextResult.selection.quotaStart,
            quotaEnd: contextResult.selection.quotaEnd,
            quotaEndUsed: contextResult.selection.quotaEndUsed,
            droppedByDedupe: contextResult.selection.droppedByDedupe,
            droppedByQuota: contextResult.selection.droppedByQuota,
            uniqueDocs: contextResult.selection.uniqueDocs,
            finalSelectedCount: contextResult.selection.finalSelectedCount,
            selectionUnit: contextResult.selection.selectionUnit,
            inputCount: contextResult.selection.inputCount,
            uniqueBeforeDedupe: contextResult.selection.uniqueBeforeDedupe,
            uniqueAfterDedupe: contextResult.selection.uniqueAfterDedupe,
            docInputCount: contextResult.selection.docSelection.inputCount,
            docUniqueBeforeDedupe:
              contextResult.selection.docSelection.uniqueBeforeDedupe,
            docUniqueAfterDedupe:
              contextResult.selection.docSelection.uniqueAfterDedupe,
            docDroppedByDedupe:
              contextResult.selection.docSelection.droppedByDedupe,
            mmrLite: contextResult.selection.mmrLite,
            mmrLambda: contextResult.selection.mmrLambda,
          });
        }
        ragLogger.debug("[langchain_chat] included metadata sample", {
          entries: contextResult.included.map((doc) => ({
            docId:
              (doc.metadata as { doc_id?: string | null })?.doc_id ??
              doc.doc_id ??
              null,
            doc_type: (doc.metadata as { doc_type?: string | null })?.doc_type,
            persona_type: (doc.metadata as { persona_type?: string | null })
              ?.persona_type,
          })),
        });
      } finally {
        if (trace) {
          const { startTime, endTime } = buildSpanTiming({
            name: "rag:root",
            startMs: ragRootStartMs,
            endMs: Date.now(),
            requestId: chainRunContext.requestId ?? null,
          });
          const metadata = buildTelemetryMetadata({
            kind: "rag_root",
            requestId: chainRunContext.requestId ?? null,
            additional: ragRootMetadata ?? undefined,
          });
          void trace.observation({
            name: "rag:root",
            metadata,
            startTime,
            endTime,
          });
          emitRagScores({
            trace,
            intent: routingDecision.intent,
            requestId: chainRunContext.requestId ?? null,
            highestScore: contextResult.highestScore,
            insufficient: contextResult.insufficient,
            uniqueDocs: contextResult.selection?.uniqueDocs,
          });
        }
        retrievalLatencyMs = Date.now() - ragRootStartMs;
      }
    }
  }

  if (safeMode && routingDecision.intent === "knowledge") {
    updateRetrievalMetadata?.(false, false);
  }

  if (
    routingDecision.intent !== "knowledge" &&
    cacheMeta.retrievalHit !== null
  ) {
    cacheMeta.retrievalHit = null;
    updateTraceCacheMetadata?.();
  }

  const summaryTokens =
    historyWindow.summaryMemory && historyWindow.summaryMemory.length > 0
      ? estimateTokens(historyWindow.summaryMemory)
      : null;
  const summaryInfo =
    summaryTokens !== null
      ? {
          originalTokens: historyWindow.tokenCount,
          summaryTokens,
          trimmedTurns: historyWindow.trimmed.length,
          maxTurns: guardrails.summary.maxTurns,
        }
      : undefined;

  const latestMeta: GuardrailMeta = {
    intent: routingDecision.intent,
    reason: routingDecision.reason,
    historyTokens: historyWindow.tokenCount,
    summaryApplied: Boolean(historyWindow.summaryMemory),
    history: {
      tokens: historyWindow.tokenCount,
      budget: guardrails.historyTokenBudget,
      trimmedTurns: historyWindow.trimmed.length,
      preservedTurns: historyWindow.preserved.length,
    },
    context: {
      included: contextResult.included.length,
      dropped: contextResult.dropped,
      totalTokens: contextResult.totalTokens,
      insufficient: contextResult.insufficient,
      retrieved: contextResult.included.length + contextResult.dropped,
      similarityThreshold: guardrails.similarityThreshold,
      highestSimilarity: Number.isFinite(contextResult.highestScore)
        ? contextResult.highestScore
        : undefined,
      contextTokenBudget: guardrails.ragContextTokenBudget,
      contextClipTokens: guardrails.ragContextClipTokens,
    },
    enhancements: enhancementSummary,
    summaryConfig: {
      enabled: guardrails.summary.enabled,
      triggerTokens: guardrails.summary.triggerTokens,
      maxTurns: guardrails.summary.maxTurns,
      maxChars: guardrails.summary.maxChars,
    },
    llmModel,
    provider,
    embeddingModel,
    summaryInfo,
  };

  const resolvedCitations =
    citationPayload ??
    buildCitationPayload(contextResult.included, {
      topKChunks,
      ragRanking,
    });

  const autoOrMultiEnabled =
    hydeMode === "auto" ||
    rewriteMode === "auto" ||
    ragMultiQueryMode === "auto";
  if (autoOrMultiEnabled && !decisionSignature) {
    decisionSignature = {
      autoTriggered: false,
      winner: null,
      altType: "none",
      multiQueryRan: false,
    };
  }

  if (_traceMetadata && includeVerboseDetails && autoDecisionMetrics) {
    applyTraceMetadataMerge(_traceMetadata, {
      retrievalAutoDecision: autoDecisionMetrics,
    });
  }

  return {
    contextResult,
    citations: resolvedCitations,
    latestMeta,
    enhancementSummary,
    decisionSignature,
    decisionTelemetry,
    retrievalLatencyMs,
  };
}
