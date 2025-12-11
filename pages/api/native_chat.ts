import { type NextApiRequest, type NextApiResponse } from "next";

import type { LocalLlmMessage, LocalLlmRequest } from "@/lib/local-llm/client";
import type { ChatConfigSnapshot, GuardrailRoute } from "@/lib/rag/types";
import type { SessionChatConfig } from "@/types/chat-config";
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
import {
  normalizeMetadata,
  type RagDocumentMetadata,
} from "@/lib/rag/metadata";
import { computeMetadataWeight } from "@/lib/rag/ranking";
import { matchRagChunksForConfig } from "@/lib/rag/retrieval";
import { buildChatConfigSnapshot } from "@/lib/rag/telemetry";
import { getAdminChatConfig } from "@/lib/server/admin-chat-config";
import { hashPayload, memoryCacheClient } from "@/lib/server/chat-cache";
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
  buildFinalSystemPrompt,
  loadChatModelSettings,
} from "@/lib/server/chat-settings";
import { respondWithOllamaUnavailable } from "@/lib/server/ollama-errors";
import { OllamaUnavailableError } from "@/lib/server/ollama-provider";
import {
  type CanonicalPageLookup,
  loadCanonicalPageLookup,
} from "@/lib/server/page-url";
import {
  applyRanker,
  generateHydeDocument,
  rewriteQuery,
} from "@/lib/server/rag-enhancements";
import { logDebugRag } from "@/lib/server/rag-logger";
import { resolveRagUrl } from "@/lib/server/rag-url-resolver";
import {
  type GuardrailEnhancements,
  type GuardrailMeta,
  serializeGuardrailMeta,
} from "@/lib/shared/guardrail-meta";
import { type ModelProvider } from "@/lib/shared/model-provider";
import { DEFAULT_REVERSE_RAG_MODE } from "@/lib/shared/rag-config";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { decideTelemetryMode } from "@/lib/telemetry/chat-langfuse";
import { computeBasePromptVersion } from "@/lib/telemetry/prompt-version";

const DEBUG_RAG_STEPS =
  (process.env.DEBUG_RAG_STEPS ?? "").toLowerCase() === "true";
const DEBUG_RAG_URLS =
  (process.env.DEBUG_RAG_URLS ?? "").toLowerCase() === "true";
const DEBUG_RAG_MSGS =
  (process.env.DEBUG_RAG_MSGS ?? "").toLowerCase() === "true";

type RetrievalLogEntry = {
  doc_id: string | null;
  similarity: number | null;
  weight?: number | null;
  finalScore?: number | null;
  doc_type?: string | null;
  persona_type?: string | null;
  is_public?: boolean | null;
};

function logRetrievalStage(
  trace: ReturnType<typeof langfuse.trace> | null,
  stage: string,
  entries: RetrievalLogEntry[],
  meta?: {
    engine?: string;
    presetKey?: string;
    chatConfig?: ChatConfigSnapshot;
  },
) {
  if (!DEBUG_RAG_STEPS && !trace) {
    return;
  }

  const payload = entries.map((entry) => ({
    doc_id: entry.doc_id,
    similarity: entry.similarity,
    weight: entry.weight,
    finalScore: entry.finalScore,
    doc_type: entry.doc_type ?? null,
    persona_type: entry.persona_type ?? null,
    is_public: entry.is_public ?? null,
  }));

  if (DEBUG_RAG_STEPS) {
    console.log("[rag:native] retrieval", stage, payload);
  }

  void trace?.observation({
    name: "rag_retrieval_stage",
    metadata: {
      stage,
      engine: meta?.engine ?? "native",
      presetKey: meta?.presetKey ?? meta?.chatConfig?.presetKey ?? "default",
      chatConfig: meta?.chatConfig,
      ragConfig: meta?.chatConfig,
      entries: payload,
    },
  });
}
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
  [key: string]: unknown;
};

type ChatRequestBody = {
  messages?: unknown;
  provider?: unknown;
  embeddingProvider?: unknown;
  model?: unknown;
  embeddingModel?: unknown;
  embeddingSpaceId?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
  reverseRagEnabled?: unknown;
  reverseRagMode?: unknown;
  hydeEnabled?: unknown;
  rankerMode?: unknown;
  sessionConfig?: unknown;
};

const DEFAULT_TEMPERATURE = Number(process.env.LLM_TEMPERATURE ?? 0);
const DEFAULT_MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 512);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

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
      console.log("[native_chat runtime]", {
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
      console.error(
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
    const telemetryDecision = decideTelemetryMode(
      adminConfig.telemetry.sampleRate,
      adminConfig.telemetry.detailLevel,
    );
    const basePromptVersion = computeBasePromptVersion(adminConfig, presetId);
    const chatConfigSnapshot: ChatConfigSnapshot | undefined =
      telemetryDecision.includeConfigSnapshot
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
    const traceMetadata: {
      [key: string]: unknown;
      cache?: typeof cacheMeta;
    } = {
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
    };
    if (chatConfigSnapshot) {
      traceMetadata.chatConfig = chatConfigSnapshot;
      traceMetadata.ragConfig = chatConfigSnapshot;
      traceMetadata.cache = cacheMeta;
    }
    const reverseRagEnabled = runtime.reverseRagEnabled;
    const reverseRagMode = runtime.reverseRagMode ?? DEFAULT_REVERSE_RAG_MODE;
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
    const sessionId =
      (req.headers["x-chat-id"] as string) ??
      (req.headers["x-request-id"] as string) ??
      normalizedQuestion.normalized;
    const userId =
      typeof req.headers["x-user-id"] === "string"
        ? req.headers["x-user-id"]
        : undefined;
    traceMetadata.provider = provider;
    traceMetadata.model = llmModel;
    traceMetadata.embeddingProvider = embeddingProvider;
    traceMetadata.embeddingModel = embeddingModel;
    const trace = telemetryDecision.shouldEmitTrace
      ? langfuse.trace({
          name: "native-chat-turn",
          sessionId,
          userId,
          input: normalizedQuestion.normalized,
          metadata: traceMetadata,
        })
      : null;
    const includeVerboseDetails = telemetryDecision.includeRetrievalDetails;
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
        if (traceMetadata.cache) {
          traceMetadata.cache.responseHit = true;
          void trace?.update({
            metadata: traceMetadata,
            output: cachedResponse.output,
          });
        }
        res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(cachedResponse.output);
        return;
      }
    }
    const temperature = DEFAULT_TEMPERATURE;
    const maxTokens = DEFAULT_MAX_TOKENS;
    const enhancements: GuardrailEnhancements = {
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

    if (DEBUG_RAG_STEPS) {
      console.log("[native_chat] guardrails", {
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
    }

    let contextResult: ContextWindowResult = {
      contextBlock: "",
      included: [],
      dropped: 0,
      totalTokens: 0,
      insufficient: routingDecision.intent !== "knowledge",
      highestScore: 0,
    };

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
          if (traceMetadata.cache) {
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
        const reversedQuery = await rewriteQuery(
          normalizedQuestion.normalized,
          {
            enabled: reverseRagEnabled,
            mode: reverseRagMode,
            provider,
            model: llmModel,
          },
        );
        enhancements.reverseRag = {
          enabled: reverseRagEnabled,
          mode: reverseRagMode,
          original: normalizedQuestion.normalized,
          rewritten: reversedQuery,
        };
        if (trace && reverseRagEnabled) {
          void trace.observation({
            name: "reverse_rag",
            input: normalizedQuestion.normalized,
            output: reversedQuery,
            metadata: {
              env,
              provider,
              model: llmModel,
              mode: reverseRagMode,
              stage: "reverse-rag",
              type: "reverse_rag",
            },
          });
        }
        logDebugRag("reverse-query", {
          enabled: reverseRagEnabled,
          mode: reverseRagMode,
          original: normalizedQuestion.normalized,
          rewritten: reversedQuery,
        });
        const hydeDocument = await generateHydeDocument(reversedQuery, {
          enabled: hydeEnabled,
          provider,
          model: llmModel,
        });
        enhancements.hyde = {
          enabled: hydeEnabled,
          generated: hydeDocument ?? null,
        };
        if (trace) {
          void trace.observation({
            name: "hyde",
            input: reversedQuery,
            output: hydeDocument ?? undefined,
            metadata: {
              env,
              provider,
              model: llmModel,
              stage: "hyde",
              type: "hyde",
            },
          });
        }
        const embeddingInput =
          hydeEnabled && hydeDocument
            ? hydeDocument
            : normalizedQuestion.normalized;
        const embedding = await embedText(embeddingInput, {
          provider: embeddingSelection.provider,
          model: embeddingSelection.model,
          embeddingModelId: embeddingSelection.embeddingModelId,
          embeddingSpaceId: embeddingSelection.embeddingSpaceId,
        });
        const embeddingProvider =
          embeddingSelection.provider === "gemini" ? "gemini" : "openai";

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

        const docIds = typedDocuments
          .map(
            (doc) =>
              doc.doc_id ||
              doc.docId ||
              doc.document_id ||
              doc.documentId ||
              null,
          )
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          );

        let metadataRows: {
          doc_id?: string;
          metadata?: RagDocumentMetadata | null;
        }[] = [];
        if (docIds.length > 0) {
          const { data } = await supabaseClient
            .from("rag_documents")
            .select("doc_id, metadata")
            .in("doc_id", docIds);
          metadataRows = (data ?? []) as typeof metadataRows;
        }

        const metadataMap = new Map<string, RagDocumentMetadata | null>();
        for (const row of metadataRows ?? []) {
          const docId = (row as { doc_id?: string }).doc_id;
          if (typeof docId === "string") {
            metadataMap.set(
              docId,
              normalizeMetadata(
                (row as { metadata?: unknown }).metadata as any,
              ),
            );
          }
        }

        if (includeVerboseDetails) {
          logRetrievalStage(
            trace,
            "raw_results",
            typedDocuments.map((doc) => ({
              doc_id:
                doc.doc_id ||
                doc.docId ||
                doc.document_id ||
                doc.documentId ||
                null,
              similarity:
                typeof doc.similarity === "number"
                  ? doc.similarity
                  : typeof doc.score === "number"
                    ? doc.score
                    : typeof doc.similarity_score === "number"
                      ? doc.similarity_score
                      : null,
              doc_type: null,
              persona_type: null,
              is_public: null,
            })),
            {
              engine: "native",
              presetKey: chatConfigSnapshot?.presetKey,
              chatConfig: chatConfigSnapshot,
            },
          );
        }

        const enrichedDocuments = typedDocuments
          .map((doc) => {
            const docId =
              doc.doc_id ||
              doc.docId ||
              doc.document_id ||
              doc.documentId ||
              null;
            const metadata = docId ? (metadataMap.get(docId) ?? null) : null;
            const baseSimilarity =
              typeof doc.similarity === "number"
                ? doc.similarity
                : typeof doc.score === "number"
                  ? doc.score
                  : typeof doc.similarity_score === "number"
                    ? doc.similarity_score
                    : 0;
            if (metadata?.is_public === false) {
              return {
                filteredOut: true,
                baseSimilarity,
                metadata,
                docId,
              };
            }
            const weight = computeMetadataWeight(
              metadata ?? undefined,
              ragRanking,
            );
            const finalScore = baseSimilarity * weight;

            return {
              ...doc,
              metadata,
              similarity: finalScore,
              score: finalScore,
              metadata_weight: weight,
              base_similarity: baseSimilarity,
              filteredOut: false,
            } as RagDocument & {
              metadata_weight?: number;
              base_similarity?: number;
              filteredOut?: boolean;
            };
          })
          .filter(
            (
              doc,
            ): doc is RagDocument & {
              metadata_weight?: number;
              base_similarity?: number;
              filteredOut?: boolean;
            } => doc !== null && doc.filteredOut !== true,
          )
          // eslint-disable-next-line unicorn/no-array-sort
          .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

        if (DEBUG_RAG_URLS) {
          const urls = enrichedDocuments
            .map((d) => d.metadata?.source_url)
            .filter(Boolean);
          console.log("[native_chat] retrieved urls:", urls);
        }

        if (includeVerboseDetails) {
          logRetrievalStage(
            trace,
            "after_weighting",
            enrichedDocuments.map((doc) => ({
              doc_id:
                doc.doc_id ||
                doc.docId ||
                doc.document_id ||
                doc.documentId ||
                null,
              similarity: (doc as any).base_similarity ?? null,
              weight: (doc as any).metadata_weight ?? null,
              finalScore: doc.similarity ?? null,
              doc_type:
                (doc.metadata as { doc_type?: string | null } | null)
                  ?.doc_type ?? null,
              persona_type:
                (doc.metadata as { persona_type?: string | null } | null)
                  ?.persona_type ?? null,
              is_public:
                (doc.metadata as { is_public?: boolean | null } | null)
                  ?.is_public ?? null,
            })),
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
          void trace.observation({
            name: "retrieval",
            input: embeddingInput,
            output: normalizedDocuments,
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
          void trace.observation({
            name: "reranker",
            input: normalizedDocuments,
            output: rankedDocuments,
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
        if (retrievalCacheKey) {
          await memoryCacheClient.set(
            retrievalCacheKey,
            contextResult,
            retrievalCacheTtl,
          );
          cacheMeta.retrievalHit = false;
          if (traceMetadata.cache) {
            traceMetadata.cache.retrievalHit = false;
          }
        }
        console.log("[native_chat] context compression", {
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
      console.log("[native_chat] intent fallback", {
        intent: routingDecision.intent,
      });
    }
    if (
      routingDecision.intent !== "knowledge" &&
      cacheMeta.retrievalHit !== null
    ) {
      cacheMeta.retrievalHit = null;
      if (traceMetadata.cache) {
        traceMetadata.cache.retrievalHit = null;
      }
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

    if (DEBUG_RAG_MSGS) {
      console.log("[native_chat] debug context:", {
        systemPromptLength: systemPrompt.length,
        messageCount: messages.length,
      });
      console.log(
        "[native_chat] system prompt preview:",
        systemPrompt.slice(0, 500).replaceAll("\n", "\\n"),
      );
    }

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

      // Calculate citations
      const citationMap = new Map<
        string,
        {
          doc_id?: string;
          title?: string;
          source_url?: string;
          excerpt_count: number;
        }
      >();
      const includedDocs = contextResult.included as any[];
      let index = 0;
      for (const doc of includedDocs) {
        const docId =
          doc?.metadata?.doc_id ??
          doc?.metadata?.docId ??
          doc?.metadata?.page_id ??
          doc?.metadata?.pageId ??
          undefined;
        const sourceUrl =
          doc?.metadata?.source_url ?? doc?.metadata?.sourceUrl ?? undefined;
        const normalizedUrl = sourceUrl ? sourceUrl.trim().toLowerCase() : "";
        const key =
          normalizedUrl.length > 0
            ? normalizedUrl
            : docId
              ? `doc:${docId}`
              : `idx:${index}`;
        const title =
          doc?.metadata?.title ??
          doc?.metadata?.document_meta?.title ??
          undefined;

        const existing = citationMap.get(key);
        if (existing) {
          existing.excerpt_count += 1;
        } else {
          citationMap.set(key, {
            doc_id: docId,
            title,
            source_url: sourceUrl,
            excerpt_count: 1,
          });
        }
        index += 1;
      }
      const citations = Array.from(citationMap.values());
      const citationJson = JSON.stringify(citations);

      if (responseCacheKey) {
        await memoryCacheClient.set(
          responseCacheKey,
          { output: finalOutput, citations: citationJson },
          responseCacheTtl,
        );
        cacheMeta.responseHit = false;
        if (traceMetadata.cache) {
          traceMetadata.cache.responseHit = false;
        }
      }

      if (!res.writableEnded) {
        res.write(`\n\n--- begin citations ---\n${citationJson}`);
      }

      ensureStreamHeaders();
      res.end();
      if (trace) {
        void trace.update({
          output: finalOutput,
          metadata: traceMetadata,
        });
      }
    } catch (streamErr) {
      if (!streamHeadersSent) {
        if (streamErr instanceof OllamaUnavailableError) {
          return respondWithOllamaUnavailable(res);
        }

        const errMessage = (streamErr as any)?.message || "";
        if (
          errMessage.includes("No models loaded") ||
          errMessage.includes("connection refused")
        ) {
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
        doc_id: docId ?? doc.metadata?.doc_id ?? null,
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

      console.warn(
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

function _buildPlainPrompt(
  systemPrompt: string,
  messages: ChatMessage[],
): string {
  const parts: string[] = [`System:\n${systemPrompt.trim()}`];

  for (const message of messages) {
    const label = message.role === "assistant" ? "Assistant" : "User";
    parts.push(`${label}:\n${message.content}`);
  }

  parts.push("Assistant:\n");
  return parts.join("\n\n");
}
