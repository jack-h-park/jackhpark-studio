import { type NextApiRequest, type NextApiResponse } from "next";

import type { LocalLlmMessage, LocalLlmRequest } from "@/lib/local-llm/client";
import type { GuardrailRoute } from "@/lib/rag/types";
import type { SessionChatConfig } from "@/types/chat-config";
import {
  captureChatCompletion,
  classifyChatCompletionError,
  isPostHogEnabled,
} from "@/lib/analytics/posthog";
import { resolveEmbeddingSpace } from "@/lib/core/embedding-spaces";
import { embedText } from "@/lib/core/embeddings";
import {
  getGeminiModelCandidates,
  shouldRetryGeminiModel,
} from "@/lib/core/gemini";
import { resolveLlmModel } from "@/lib/core/llm-registry";
import { requireProviderApiKey } from "@/lib/core/model-provider";
import { getOpenAIClient } from "@/lib/core/openai";
import { getAppEnv, langfuse } from "@/lib/langfuse";
import { getLocalLlmClient } from "@/lib/local-llm";
import { getLoggingConfig, llmLogger, ragLogger } from "@/lib/logging/logger";
import { type RagDocumentMetadata } from "@/lib/rag/metadata";
import { matchRagChunksForConfig } from "@/lib/rag/retrieval";
import { buildChatConfigSnapshot } from "@/lib/rag/telemetry";
import { getAdminChatConfig } from "@/lib/server/admin-chat-config";
import { hashPayload, memoryCacheClient } from "@/lib/server/chat-cache";
import {
  buildRetrievalTelemetryEntries,
  type ChatRequestBody,
  CITATIONS_SEPARATOR,
  DEFAULT_TEMPERATURE,
  logRetrievalStage,
  MAX_RETRIEVAL_TELEMETRY_ITEMS,
} from "@/lib/server/chat-common";
import {
  applyHistoryWindow,
  buildContextWindow,
  buildIntentContextFallback,
  type ContextWindowResult,
  estimateTokens,
  getChatGuardrailConfig,
  normalizeQuestion,
  routeQuestion,
} from "@/lib/server/chat-guardrails";
import { type ChatMessage, sanitizeMessages } from "@/lib/server/chat-messages";
import {
  enrichAndFilterDocs,
  extractDocIdsFromBaseDocs,
  fetchRefinedMetadata,
  processPreRetrieval,
} from "@/lib/server/chat-rag-utils";
import {
  buildFinalSystemPrompt,
  loadChatModelSettings,
} from "@/lib/server/chat-settings";
import { respondWithOllamaUnavailable } from "@/lib/server/ollama-errors";
import { OllamaUnavailableError } from "@/lib/server/ollama-provider";
import {
  type CanonicalPageLookup,
  loadCanonicalPageLookup,
} from "@/lib/server/page-url";
import { applyRanker } from "@/lib/server/rag-enhancements";
import { logDebugRag } from "@/lib/server/rag-logger";
import { resolveRagUrl } from "@/lib/server/rag-url-resolver";
import {
  type GuardrailEnhancements,
  type GuardrailMeta,
  serializeGuardrailMeta,
} from "@/lib/shared/guardrail-meta";
import { type ModelProvider } from "@/lib/shared/model-provider";
import {
  DEFAULT_REVERSE_RAG_MODE,
  type ReverseRagMode,
} from "@/lib/shared/rag-config";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { decideTelemetryMode } from "@/lib/telemetry/chat-langfuse";
import { computeBasePromptVersion } from "@/lib/telemetry/prompt-version";
import {
  buildCitationPayload,
  type CitationPayload,
} from "@/lib/types/citation";

type RagDocument = {
  id?: string | null;
  doc_id?: string | null;
  docId?: string | null;
  document_id?: string | null;
  documentId?: string | null;
  content?: string | null;
  embedding?: number[] | null;
  similarity?: number | null;
  source_url?: string | null;
  sourceUrl?: string | null;
  url?: string | null;
  metadata?: RagDocumentMetadata | null;
  // Common flexible index signature for mapping
  [key: string]: unknown;
};

const DEFAULT_MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 512);
const SMOKE_HEADERS_ENABLED =
  process.env.SMOKE_HEADERS === "1" || process.env.NODE_ENV !== "production";

function setSmokeHeaders(
  res: NextApiResponse,
  cacheHit: boolean | null,
  traceId?: string | null,
) {
  if (!SMOKE_HEADERS_ENABLED) {
    return;
  }
  res.setHeader("x-cache-hit", cacheHit === true ? "1" : "0");
  if (traceId) {
    res.setHeader("x-trace-id", traceId);
  }
}

function mergeLangfuseTags(
  existingTags: string[] | undefined,
  ...stableTags: string[]
): string[] {
  return Array.from(new Set([...(existingTags ?? []), ...stableTags]));
}

function buildStableLangfuseTags(
  existingTags: string[] | undefined,
  presetKey: string,
  guardrailRoute?: GuardrailRoute,
): string[] {
  const envTag = process.env.NODE_ENV === "production" ? "env:prod" : "env:dev";
  const normalizedPreset =
    typeof presetKey === "string" ? presetKey.trim() : "";
  const presetTag =
    normalizedPreset.length > 0
      ? `preset:${normalizedPreset}`
      : "preset:unknown";
  if (normalizedPreset.length === 0 && process.env.NODE_ENV !== "production") {
    console.warn(
      "[Langfuse] preset key missing when building trace tags; using preset:unknown",
    );
  }
  const guardrailTag =
    guardrailRoute !== undefined
      ? `guardrail:${guardrailRoute}`
      : "guardrail:normal";
  if (guardrailRoute === undefined && process.env.NODE_ENV !== "production") {
    console.warn(
      "[Langfuse] guardrail route missing from chat config snapshot; using guardrail:normal",
    );
  }
  const tags = mergeLangfuseTags(existingTags, envTag, presetTag, guardrailTag);
  if (process.env.NODE_ENV !== "production") {
    console.log("[Langfuse] tags", tags);
  }
  return tags;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const requestStart = Date.now();
  const shouldTrackPosthog = isPostHogEnabled();
  let capturePosthogEvent:
    | ((status: "success" | "error", errorType?: string | null) => void)
    | null = null;
  let _analyticsTotalTokens: number | null = null;

  try {
    const body: ChatRequestBody =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    const guardrails = await getChatGuardrailConfig();
    const adminConfig = await getAdminChatConfig();
    const sessionConfig =
      body.sessionConfig && typeof body.sessionConfig === "object"
        ? (body.sessionConfig as SessionChatConfig)
        : undefined;
    const presetId =
      sessionConfig?.presetId ??
      (typeof sessionConfig?.appliedPreset === "string"
        ? sessionConfig.appliedPreset
        : "default");
    const ragRanking = adminConfig.ragRanking;
    const backendHeader =
      typeof req.headers["x-local-llm-backend"] === "string"
        ? (req.headers["x-local-llm-backend"] as string)
        : undefined;
    const backendQuery =
      typeof req.query.localBackend === "string"
        ? (req.query.localBackend as string)
        : undefined;
    const localBackendOverride = backendHeader ?? backendQuery;

    const runtime =
      (req as any).chatRuntime ??
      (await loadChatModelSettings({
        forceRefresh: true,
        sessionConfig,
        localBackendOverride,
      }));
    if (process.env.NODE_ENV === "development") {
      llmLogger.debug("[native_chat runtime]", {
        presetKey: presetId,
        llmEngine: runtime.llmEngine,
        requireLocal: runtime.requireLocal,
        localBackendAvailable: runtime.localBackendAvailable,
        fallbackFrom: runtime.fallbackFrom,
        localLlmBackendEnv: runtime.localLlmBackendEnv,
        localBackendOverride: localBackendOverride ?? null,
      });
    }
    const localEngineTypes = ["local-ollama", "local-lmstudio"];
    const effectiveRequireLocal = runtime.requireLocal;
    const localBackendAvailable = runtime.localBackendAvailable;
    const isLocalEngine = localEngineTypes.includes(runtime.llmEngine);

    if (isLocalEngine && effectiveRequireLocal && !localBackendAvailable) {
      llmLogger.error(
        "[api/native_chat] local backend required but not available",
        {
          engine: runtime.llmEngine,
          requireLocal: effectiveRequireLocal,
        },
      );
      return res.status(500).json({
        error:
          "Local LLM backend is required for this preset but not available.",
        engine: runtime.llmEngine,
        requireLocal: effectiveRequireLocal,
        presetKey: presetId,
        localBackendEnv: runtime.localLlmBackendEnv,
      });
    }

    const rawMessages = Array.isArray(body.messages)
      ? sanitizeMessages(body.messages)
      : [];
    const historyWindow = applyHistoryWindow(rawMessages, guardrails);
    const messages = historyWindow.preserved;

    const lastMessage = messages.at(-1);
    if (!lastMessage) {
      return res.status(400).json({ error: "Bad Request: No messages found" });
    }

    const userQuery = lastMessage.content?.trim();
    if (!userQuery) {
      return res
        .status(400)
        .json({ error: "Bad Request: Missing user query content" });
    }

    const normalizedQuestion = normalizeQuestion(userQuery);
    const routingDecision = routeQuestion(
      normalizedQuestion,
      messages,
      guardrails,
    );
    const guardrailRoute: GuardrailRoute =
      routingDecision.intent === "chitchat"
        ? "chitchat"
        : routingDecision.intent === "command"
          ? "command"
          : "normal";
    const sessionId =
      (req.headers["x-chat-id"] as string) ??
      (req.headers["x-request-id"] as string) ??
      normalizedQuestion.normalized;
    const userId =
      typeof req.headers["x-user-id"] === "string"
        ? req.headers["x-user-id"]
        : undefined;
    const loggingConfig = await getLoggingConfig();
    const { enabled, sampleRate, detailLevel } = loggingConfig.telemetry;
    const telemetryDecision = decideTelemetryMode(
      enabled ? sampleRate : 0,
      detailLevel,
      Math.random,
    );
    const shouldEmitTrace = telemetryDecision.shouldEmitTrace;
    const includeConfigSnapshot = telemetryDecision.includeConfigSnapshot;
    const includeVerboseDetails = telemetryDecision.includeRetrievalDetails;
    const shouldCaptureConfig = shouldEmitTrace && includeConfigSnapshot;
    const traceInput =
      shouldEmitTrace && detailLevel !== "minimal"
        ? normalizedQuestion.normalized
        : undefined;
    const basePromptVersion = shouldCaptureConfig
      ? computeBasePromptVersion(adminConfig, presetId)
      : undefined;
    const chatConfigSnapshot = shouldCaptureConfig
      ? buildChatConfigSnapshot(adminConfig, presetId, {
          guardrailRoute,
          basePromptVersion,
        })
      : undefined;
    const env = getAppEnv();
    const supabaseClient = getSupabaseAdminClient();
    const supabaseMatchFilter = null;

    const cacheMeta: {
      responseHit: boolean | null;
      retrievalHit: boolean | null;
    } = {
      responseHit: adminConfig.cache.responseTtlSeconds > 0 ? false : null,
      retrievalHit: adminConfig.cache.retrievalTtlSeconds > 0 ? false : null,
    };
    const traceMetadata:
      | {
          [key: string]: unknown;
          cache?: typeof cacheMeta;
        }
      | undefined = shouldEmitTrace
      ? {
          env,
          config: {
            reverseRagEnabled: runtime.reverseRagEnabled,
            reverseRagMode: runtime.reverseRagMode ?? DEFAULT_REVERSE_RAG_MODE,
            hydeEnabled: runtime.hydeEnabled,
            rankerMode: runtime.rankerMode,
            guardrailRoute,
          },
          llmResolution: {
            requestedModelId: runtime.requestedLlmModelId,
            resolvedModelId: runtime.resolvedLlmModelId,
            wasSubstituted: runtime.llmModelWasSubstituted,
            substitutionReason: runtime.llmSubstitutionReason,
          },
        }
      : undefined;
    if (traceMetadata && chatConfigSnapshot) {
      traceMetadata.chatConfig = chatConfigSnapshot;
      traceMetadata.ragConfig = chatConfigSnapshot;
      traceMetadata.cache = cacheMeta;
    }
    const traceTags = shouldEmitTrace
      ? buildStableLangfuseTags(
          undefined,
          presetId,
          chatConfigSnapshot?.guardrails?.route,
        )
      : undefined;
    const reverseRagEnabled = runtime.reverseRagEnabled;
    const reverseRagMode = (runtime.reverseRagMode ??
      DEFAULT_REVERSE_RAG_MODE) as ReverseRagMode;
    const hydeEnabled = runtime.hydeEnabled;
    const rankerMode = runtime.rankerMode;

    const llmModelId = runtime.resolvedLlmModelId ?? runtime.llmModelId;
    const llmSelection = resolveLlmModel({
      provider: runtime.llmProvider,
      modelId: llmModelId,
      model: llmModelId,
    });
    const embeddingSelection = resolveEmbeddingSpace({
      provider: runtime.embeddingProvider ?? llmSelection.provider,
      embeddingModelId: runtime.embeddingModelId ?? runtime.embeddingModel,
      embeddingSpaceId: runtime.embeddingSpaceId,
      model: runtime.embeddingModel ?? runtime.embeddingModelId ?? undefined,
    });

    const provider = llmSelection.provider;
    const embeddingProvider = embeddingSelection.provider;
    const llmModel = llmSelection.model;
    const embeddingModel = embeddingSelection.model;
    if (traceMetadata) {
      traceMetadata.provider = provider;
      traceMetadata.model = llmModel;
      traceMetadata.embeddingProvider = embeddingProvider;
      traceMetadata.embeddingModel = embeddingModel;
    }
    const trace = shouldEmitTrace
      ? langfuse.trace({
          name: "native-chat-turn",
          sessionId,
          userId,
          input: traceInput,
          metadata: traceMetadata,
          tags: traceTags,
        })
      : null;
    const analyticsModelState = {
      provider,
      model: llmModel,
      embeddingModel,
    };
    const resolvePosthogDistinctId = () => {
      const requestId =
        typeof req.headers["x-request-id"] === "string"
          ? req.headers["x-request-id"]
          : undefined;
      const anonymousId =
        typeof req.headers["x-anonymous-id"] === "string"
          ? req.headers["x-anonymous-id"]
          : undefined;
      const traceId = trace?.traceId ?? null;
      const candidates = [
        userId,
        anonymousId,
        sessionId,
        traceId ?? undefined,
        requestId,
      ];
      return (
        candidates.find(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        ) ?? null
      );
    };
    const initializePosthogCapture = () => {
      if (!shouldTrackPosthog) {
        return null;
      }
      let posthogCaptured = false;

      return (status: "success" | "error", errorType: string | null = null) => {
        if (posthogCaptured) {
          return;
        }
        const distinctId = resolvePosthogDistinctId();
        if (!distinctId) {
          posthogCaptured = true;
          return;
        }
        posthogCaptured = true;
        captureChatCompletion({
          distinctId,
          properties: {
            env,
            trace_id: trace?.traceId ?? null,
            chat_session_id: sessionId ?? null,
            preset_key: chatConfigSnapshot?.presetKey ?? presetId ?? "unknown",
            chat_engine: "native",
            rag_enabled: guardrails.ragTopK > 0,
            prompt_version:
              chatConfigSnapshot?.prompt?.baseVersion ?? "unknown",
            guardrail_route: guardrailRoute ?? "normal",
            provider: analyticsModelState.provider ?? null,
            model: analyticsModelState.model ?? null,
            embedding_model: analyticsModelState.embeddingModel ?? null,
            latency_ms: Date.now() - requestStart,
            total_tokens: _analyticsTotalTokens,
            response_cache_hit: cacheMeta.responseHit,
            retrieval_cache_hit: cacheMeta.retrievalHit,
            status,
            error_type: errorType,
          },
        });
      };
    };
    capturePosthogEvent = initializePosthogCapture();
    const responseCacheTtl = adminConfig.cache.responseTtlSeconds;
    const retrievalCacheTtl = adminConfig.cache.retrievalTtlSeconds;
    const responseCacheKey =
      responseCacheTtl > 0
        ? `chat:response:${presetId}:${hashPayload({
            presetId,
            intent: routingDecision.intent,
            messages,
          })}`
        : null;
    if (responseCacheKey) {
      const cachedResponse = await memoryCacheClient.get<{ output: string }>(
        responseCacheKey,
      );
      if (cachedResponse) {
        cacheMeta.responseHit = true;
        if (traceMetadata?.cache) {
          traceMetadata.cache.responseHit = true;
          void trace?.update({
            metadata: traceMetadata,
            output: cachedResponse.output,
          });
        }
        setSmokeHeaders(res, true, trace?.traceId ?? null);
        res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(cachedResponse.output);
        capturePosthogEvent?.("success", null);
        return;
      }
    }
    const temperature = DEFAULT_TEMPERATURE;
    const maxTokens = DEFAULT_MAX_TOKENS;

    let enhancements: GuardrailEnhancements = {
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

    ragLogger.debug("[native_chat] guardrails", {
      intent: routingDecision.intent,
      reason: routingDecision.reason,
      historyTokens: historyWindow.tokenCount,
      summaryApplied: Boolean(historyWindow.summaryMemory),
      provider,
      embeddingProvider,
      llmModel,
      embeddingModel,
      embeddingSpaceId: embeddingSelection.embeddingSpaceId,
      reverseRagEnabled,
      reverseRagMode,
      hydeEnabled,
      rankerMode,
    });

    let contextResult: ContextWindowResult = {
      contextBlock: "",
      included: [],
      dropped: 0,
      totalTokens: 0,
      insufficient: routingDecision.intent !== "knowledge",
      highestScore: 0,
    };
    let citationPayload: CitationPayload | null = null;

    if (routingDecision.intent === "knowledge") {
      let retrievalCacheKey: string | null = null;
      if (retrievalCacheTtl > 0) {
        retrievalCacheKey = `chat:retrieval:${presetId}:${hashPayload({
          question: normalizedQuestion.normalized,
          presetId,
          ragTopK: guardrails.ragTopK,
          similarityThreshold: guardrails.similarityThreshold,
        })}`;
        const cachedContext =
          await memoryCacheClient.get<ContextWindowResult>(retrievalCacheKey);
        if (cachedContext) {
          cacheMeta.retrievalHit = true;
          contextResult = cachedContext;
          if (traceMetadata?.cache) {
            traceMetadata.cache.retrievalHit = true;
          }
        }
      }

      if (cacheMeta.retrievalHit === true) {
        logDebugRag("retrieval-cache", {
          hit: true,
          presetId,
        });
      } else {
        // --- Shared Pre-Retrieval (Reverse RAG / Hyde) ---
        const preRetrieval = await processPreRetrieval({
          question: normalizedQuestion.normalized,
          reverseRagEnabled,
          reverseRagMode,
          hydeEnabled,
          rankerMode,
          provider,
          model: llmModel,
          trace,
          env,
          logDebugRag,
        });
        enhancements = preRetrieval.enhancementSummary;

        const embedding = await embedText(preRetrieval.embeddingTarget, {
          provider: embeddingSelection.provider,
          model: embeddingSelection.model,
          embeddingModelId: embeddingSelection.embeddingModelId,
          embeddingSpaceId: embeddingSelection.embeddingSpaceId,
        });
        const embeddingProvider =
          embeddingSelection.provider === "gemini" ? "gemini" : "openai";

        // --- Retrieval (Specific to Native) ---
        let typedDocuments: RagDocument[] = [];
        try {
          const result = await matchRagChunksForConfig({
            client: supabaseClient,
            embedding,
            matchCount: guardrails.ragTopK * 4,
            similarityThreshold: guardrails.similarityThreshold,
            filter: supabaseMatchFilter ?? {},
            mode: "native",
            embeddingProvider,
          });
          typedDocuments = Array.isArray(result)
            ? (result as RagDocument[])
            : [];
        } catch (matchErr) {
          console.error("Error matching documents:", matchErr);
          return res.status(500).json({
            error: `Error matching documents: ${
              matchErr instanceof Error ? matchErr.message : String(matchErr)
            }`,
          });
        }

        // --- Shared Post-Retrieval ---
        const baseRetrievalItems = typedDocuments.map((doc) => ({
          ...doc,
          docId:
            doc.doc_id ||
            doc.docId ||
            doc.document_id ||
            doc.documentId ||
            null,
          baseSimilarity:
            typeof doc.similarity === "number"
              ? doc.similarity
              : typeof doc.score === "number"
                ? doc.score
                : typeof doc.similarity_score === "number"
                  ? doc.similarity_score
                  : 0,
          metadata: doc.metadata,
        }));

        if (includeVerboseDetails && trace) {
          logRetrievalStage(
            trace,
            "raw_results",
            buildRetrievalTelemetryEntries(
              baseRetrievalItems,
              MAX_RETRIEVAL_TELEMETRY_ITEMS,
            ),
            {
              engine: "native",
              presetKey: chatConfigSnapshot?.presetKey,
              chatConfig: chatConfigSnapshot,
            },
          );
        }

        const docIds = extractDocIdsFromBaseDocs(baseRetrievalItems);
        const metadataMap = await fetchRefinedMetadata(docIds, supabaseClient);

        // Enrich, Weight, Filter, Sort
        const enrichedDocuments = enrichAndFilterDocs(
          baseRetrievalItems,
          metadataMap,
          ragRanking,
        );

        ragLogger.debug("[native_chat] retrieved urls", {
          urls: enrichedDocuments
            .map((d) => d.metadata?.source_url)
            .filter(Boolean),
        });

        if (includeVerboseDetails && trace) {
          logRetrievalStage(
            trace,
            "after_weighting",
            buildRetrievalTelemetryEntries(
              enrichedDocuments,
              MAX_RETRIEVAL_TELEMETRY_ITEMS,
            ),
            {
              engine: "native",
              presetKey: chatConfigSnapshot?.presetKey,
              chatConfig: chatConfigSnapshot,
            },
          );
        }

        const canonicalLookup = await loadCanonicalPageLookup();
        const normalizedDocuments = applyPublicPageUrls(
          enrichedDocuments,
          canonicalLookup,
        );

        if (trace && includeVerboseDetails) {
          const retrievalTelemetry = buildRetrievalTelemetryEntries(
            normalizedDocuments,
            MAX_RETRIEVAL_TELEMETRY_ITEMS,
          );
          void trace.observation({
            name: "retrieval",
            input: preRetrieval.embeddingTarget,
            output: retrievalTelemetry,
            metadata: {
              env,
              provider,
              model: llmModel,
              source: "supabase",
              stage: "retrieval",
              results: normalizedDocuments.length,
              cache: {
                retrievalHit: cacheMeta.retrievalHit,
              },
            },
          });
        }

        const rankedDocuments = await applyRanker(normalizedDocuments, {
          mode: rankerMode,
          maxResults: Math.max(guardrails.ragTopK, 1),
          embeddingSelection,
          queryEmbedding: embedding,
        });

        if (trace && includeVerboseDetails) {
          const rerankerInputTelemetry = buildRetrievalTelemetryEntries(
            normalizedDocuments,
            MAX_RETRIEVAL_TELEMETRY_ITEMS,
          );
          const rerankerOutputTelemetry = buildRetrievalTelemetryEntries(
            rankedDocuments,
            MAX_RETRIEVAL_TELEMETRY_ITEMS,
          );
          void trace.observation({
            name: "reranker",
            input: rerankerInputTelemetry,
            output: rerankerOutputTelemetry,
            metadata: {
              env,
              provider,
              model: llmModel,
              mode: rankerMode,
              stage: "reranker",
              results: rankedDocuments.length,
              cache: {
                retrievalHit: cacheMeta.retrievalHit,
              },
            },
          });
        }

        contextResult = buildContextWindow(rankedDocuments, guardrails);
        const topKChunks = Math.max(
          guardrails.ragTopK,
          contextResult.included.length + (contextResult.dropped ?? 0),
        );
        citationPayload = buildCitationPayload(contextResult.included, {
          topKChunks,
          ragRanking,
        });
        if (retrievalCacheKey) {
          await memoryCacheClient.set(
            retrievalCacheKey,
            contextResult,
            retrievalCacheTtl,
          );
          cacheMeta.retrievalHit = false;
          if (traceMetadata?.cache) {
            traceMetadata.cache.retrievalHit = false;
          }
        }
        ragLogger.debug("[native_chat] included metadata sample", {
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
        llmLogger.debug("[native_chat] context compression", {
          retrieved: normalizedDocuments.length,
          ranked: rankedDocuments.length,
          included: contextResult.included.length,
          dropped: contextResult.dropped,
          totalTokens: contextResult.totalTokens,
          highestScore: Number(contextResult.highestScore.toFixed(3)),
          insufficient: contextResult.insufficient,
          rankerMode,
        });
      }
    } else {
      contextResult = buildIntentContextFallback(
        routingDecision.intent,
        guardrails,
      );
      llmLogger.debug("[native_chat] intent fallback", {
        intent: routingDecision.intent,
      });
    }
    if (
      routingDecision.intent !== "knowledge" &&
      cacheMeta.retrievalHit !== null
    ) {
      cacheMeta.retrievalHit = null;
      if (traceMetadata?.cache) {
        traceMetadata.cache.retrievalHit = null;
      }
    }

    _analyticsTotalTokens =
      typeof contextResult.totalTokens === "number"
        ? contextResult.totalTokens
        : null;

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

    const responseMeta: GuardrailMeta = {
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
      summaryConfig: {
        enabled: guardrails.summary.enabled,
        triggerTokens: guardrails.summary.triggerTokens,
        maxTurns: guardrails.summary.maxTurns,
        maxChars: guardrails.summary.maxChars,
      },
      summaryInfo,
      enhancements,
      provider,
      llmModel,
      embeddingModel,
    };
    res.setHeader("Content-Encoding", "identity");
    res.setHeader(
      "X-Guardrail-Meta",
      encodeURIComponent(serializeGuardrailMeta(responseMeta)),
    );

    const basePrompt = buildFinalSystemPrompt({
      adminConfig,
      sessionConfig,
    });
    const contextBlock =
      contextResult.contextBlock && contextResult.contextBlock.length > 0
        ? contextResult.contextBlock
        : "(No relevant context was found.)";
    const summaryBlock = historyWindow.summaryMemory
      ? `Conversation summary:\n${historyWindow.summaryMemory}`
      : null;
    const contextStatus = contextResult.insufficient
      ? "Context status: No high-confidence matches satisfied the threshold. If unsure, be explicit about the missing information."
      : `Context status: ${contextResult.included.length} excerpts (${contextResult.totalTokens} tokens).`;

    const systemPrompt = [
      basePrompt.trim(),
      "",
      `Intent: ${routingDecision.intent} (${routingDecision.reason})`,
      contextStatus,
      "",
      "Context:",
      contextBlock,
      summaryBlock ? `\n${summaryBlock}` : null,
    ]
      .filter((part) => part !== null && part !== undefined)
      .join("\n");
    if (trace) {
      void trace.observation({
        name: "generation",
        input: {
          systemPrompt,
          context: contextResult.contextBlock,
        },
        metadata: {
          env,
          provider,
          model: llmModel,
          temperature,
          maxTokens,
          stage: "generation",
        },
      });
    }

    ragLogger.trace("[native_chat] debug context", {
      systemPromptLength: systemPrompt.length,
      messageCount: messages.length,
    });
    ragLogger.trace(
      "[native_chat] system prompt preview",
      systemPrompt.slice(0, 500).replaceAll("\n", "\\n"),
    );

    const stream = streamChatCompletion({
      provider,
      model: llmModel,
      temperature,
      maxTokens,
      systemPrompt,
      messages,
      stream: true,
    });
    let finalOutput = "";
    let streamHeadersSent = false;
    const ensureStreamHeaders = () => {
      if (!streamHeadersSent) {
        setSmokeHeaders(res, cacheMeta.responseHit, trace?.traceId ?? null);
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
        });
        streamHeadersSent = true;
      }
    };

    try {
      for await (const chunk of stream) {
        if (!chunk || res.writableEnded) {
          continue;
        }
        ensureStreamHeaders();
        finalOutput += chunk;
        res.write(chunk);
      }

      const resolvedCitationPayload =
        citationPayload ??
        buildCitationPayload(contextResult.included, {
          topKChunks: Math.max(
            guardrails.ragTopK,
            contextResult.included.length + (contextResult.dropped ?? 0),
          ),
          ragRanking,
        });
      const citationJson = JSON.stringify(resolvedCitationPayload);
      if (responseCacheKey) {
        await memoryCacheClient.set(
          responseCacheKey,
          { output: finalOutput, citations: citationJson },
          responseCacheTtl,
        );
        cacheMeta.responseHit = false;
        if (traceMetadata?.cache) {
          traceMetadata.cache.responseHit = false;
        }
      }

      if (!res.writableEnded) {
        res.write(`${CITATIONS_SEPARATOR}${citationJson}`);
      }

      ensureStreamHeaders();
      res.end();
      if (trace) {
        void trace.update({
          output: finalOutput,
          metadata: traceMetadata,
        });
      }
      capturePosthogEvent?.("success", null);
    } catch (streamErr) {
      if (!streamHeadersSent) {
        if (streamErr instanceof OllamaUnavailableError) {
          capturePosthogEvent?.("error", "local_llm_unavailable");
          return respondWithOllamaUnavailable(res);
        }

        const errMessage = (streamErr as any)?.message || "";
        if (
          errMessage.includes("No models loaded") ||
          errMessage.includes("connection refused")
        ) {
          capturePosthogEvent?.("error", "local_llm_unavailable");
          return res.status(503).json({
            error: {
              code: "LOCAL_LLM_UNAVAILABLE",
              message:
                "LM Studio에 로드된 모델이 없습니다. LM Studio 앱에서 모델을 Load 해주세요.",
            },
          });
        }
        throw streamErr;
      }
      throw streamErr;
    }
  } catch (err: any) {
    const errorType =
      err instanceof OllamaUnavailableError
        ? "local_llm_unavailable"
        : classifyChatCompletionError(err);
    capturePosthogEvent?.("error", errorType);
    console.error("Chat API error:", err);
    const errorMessage = err?.message || "An unexpected error occurred";
    if (!res.headersSent) {
      if (err instanceof OllamaUnavailableError) {
        return respondWithOllamaUnavailable(res);
      }
      res.status(500).json({ error: errorMessage });
    } else {
      res.end();
    }
  } finally {
    if (!res.writableEnded) {
      if (!res.headersSent) {
        res
          .status(500)
          .json({ error: "Native chat handler did not produce a response" });
      } else {
        res.end();
      }
    }
  }
}

function applyPublicPageUrls(
  documents: RagDocument[],
  canonicalLookup: CanonicalPageLookup,
): RagDocument[] {
  if (!documents?.length) {
    return documents;
  }

  return documents.map((doc: RagDocument, index) => {
    const { docId, sourceUrl } = resolveRagUrl({
      docIdCandidates: [
        doc.doc_id,
        doc.docId,
        doc.document_id,
        doc.documentId,
        doc.id,
        doc.metadata?.doc_id,
        doc.metadata?.docId,
        doc.metadata?.page_id,
        doc.metadata?.pageId,
      ],
      sourceUrlCandidates: [
        doc.source_url,
        doc.sourceUrl,
        doc.metadata?.source_url,
        doc.metadata?.sourceUrl,
        doc.metadata?.url,
        doc.url,
      ],
      canonicalLookup,
      debugLabel: "native_chat:url",
      index,
    });

    if (sourceUrl) {
      doc.source_url = sourceUrl;
      doc.metadata = {
        ...doc.metadata,
        doc_id: docId ?? doc.metadata?.doc_id ?? undefined,
        source_url: sourceUrl,
      };
    }

    if (docId && typeof doc.doc_id !== "string") {
      doc.doc_id = docId;
    }

    return doc;
  });
}

type ChatStreamOptions = {
  provider: ModelProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  messages: ChatMessage[];
  stream?: boolean;
};

async function* streamChatCompletion(
  options: ChatStreamOptions,
): AsyncGenerator<string> {
  switch (options.provider) {
    case "openai":
      yield* streamOpenAI(options);
      break;
    case "gemini":
      yield* streamGemini(options);
      break;
    case "ollama":
    case "lmstudio":
      yield* streamLocalLlmChat(options);
      break;
    default:
      throw new Error(`Unsupported provider: ${options.provider}`);
  }
}

async function* streamOpenAI(
  options: ChatStreamOptions,
): AsyncGenerator<string> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: options.model,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    stream: true,
    messages: [
      { role: "system", content: options.systemPrompt },
      ...options.messages,
    ],
  });

  for await (const chunk of response) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

async function* streamGemini(
  options: ChatStreamOptions,
): AsyncGenerator<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const apiKey = requireProviderApiKey("gemini");
  const client = new GoogleGenerativeAI(apiKey);
  const contents = options.messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  const modelCandidates = getGeminiModelCandidates(options.model);
  let lastError: unknown;

  for (let index = 0; index < modelCandidates.length; index++) {
    const modelName = modelCandidates[index];
    const nextModelName = modelCandidates[index + 1];

    try {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: options.systemPrompt,
      });
      const result = await model.generateContentStream({
        contents,
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
        },
      });

      for await (const chunk of result.stream) {
        const text =
          chunk.text?.() ??
          chunk.candidates?.[0]?.content?.parts
            ?.map((part: { text?: string }) => part.text ?? "")
            .join("");
        if (text) {
          yield text;
        }
      }

      return;
    } catch (err) {
      lastError = err;
      const shouldRetry =
        Boolean(nextModelName) && shouldRetryGeminiModel(modelName, err);

      if (!shouldRetry) {
        throw err;
      }

      llmLogger.info(
        `[native_chat] Gemini model "${modelName}" failed (${err instanceof Error ? err.message : String(err)}). Falling back to "${nextModelName}".`,
      );
    }
  }

  if (lastError) {
    throw lastError;
  }
}

function normalizeLocalChunkContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry: any) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (entry && typeof entry === "object") {
          const candidate = entry as {
            text?: unknown;
            content?: unknown;
          };
          if (typeof candidate.text === "string") {
            return candidate.text;
          }
          if (typeof candidate.content === "string") {
            return candidate.content;
          }
        }
        return "";
      })
      .join("");
  }

  if (content && typeof content === "object") {
    const candidate = content as { text?: unknown; content?: unknown };
    if (typeof candidate.text === "string") {
      return candidate.text;
    }
    if (typeof candidate.content === "string") {
      return candidate.content;
    }
  }

  return "";
}

async function* streamLocalLlmChat(
  options: ChatStreamOptions,
): AsyncGenerator<string> {
  const client = getLocalLlmClient();
  if (!client) {
    throw new Error("Local LLM backend is not configured");
  }

  const request: LocalLlmRequest = buildLocalLlmRequest(options);
  for await (const chunk of client.chat(request)) {
    const content = normalizeLocalChunkContent((chunk as any).content);
    if (content.length > 0) {
      yield content;
    }
  }
}

function buildLocalLlmRequest(options: ChatStreamOptions): LocalLlmRequest {
  return {
    model: options.model,
    messages: buildLocalLlmMessages(options.systemPrompt, options.messages),
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  };
}

function buildLocalLlmMessages(
  systemPrompt: string,
  messages: ChatMessage[],
): LocalLlmMessage[] {
  const result: LocalLlmMessage[] = [];
  const normalizedSystem = systemPrompt?.trim();
  if (normalizedSystem) {
    result.push({ role: "system", content: normalizedSystem });
  }
  for (const message of messages) {
    const content = message.content?.trim();
    if (!content) {
      continue;
    }
    result.push({
      role: message.role,
      content: message.content,
    });
  }
  return result;
}
