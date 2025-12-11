// pages/api/langchain_chat.ts
import type { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { BaseLanguageModelInterface } from "@langchain/core/language_models/base";
import type { NextApiRequest, NextApiResponse } from "next";

import type { ChatConfigSnapshot, GuardrailRoute } from "@/lib/rag/types";
import type { SessionChatConfig } from "@/types/chat-config";
import {
  type EmbeddingSpace,
  resolveEmbeddingSpace,
} from "@/lib/core/embedding-spaces";
import {
  getGeminiModelCandidates,
  shouldRetryGeminiModel,
} from "@/lib/core/gemini";
import { resolveLlmModel } from "@/lib/core/llm-registry";
import { getLmStudioRuntimeConfig } from "@/lib/core/lmstudio";
import { requireProviderApiKey } from "@/lib/core/model-provider";
import { getOllamaRuntimeConfig } from "@/lib/core/ollama";
import { getLcChunksView, getLcMatchFunction } from "@/lib/core/rag-tables";
import { getAppEnv, langfuse } from "@/lib/langfuse";
import {
  normalizeMetadata,
  type RagDocumentMetadata,
} from "@/lib/rag/metadata";
import { computeMetadataWeight } from "@/lib/rag/ranking";
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
import { decideTelemetryMode } from "@/lib/telemetry/chat-langfuse";
import { computeBasePromptVersion } from "@/lib/telemetry/prompt-version";

/**
 * Pages Router API (Node.js runtime).
 * Use Node (not Edge) for LangChain + Supabase clients.
 */
export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" },
  },
};

type Citation = {
  doc_id?: string;
  title?: string;
  source_url?: string;
  excerpt_count?: number;
};
type ChatRequestBody = {
  question?: unknown;
  messages?: unknown;
  provider?: unknown;
  embeddingProvider?: unknown;
  model?: unknown;
  embeddingModel?: unknown;
  embeddingSpaceId?: unknown;
  temperature?: unknown;
  reverseRagEnabled?: unknown;
  reverseRagMode?: unknown;
  hydeEnabled?: unknown;
  rankerMode?: unknown;
  sessionConfig?: unknown;
  config?: unknown;
};

const CITATIONS_SEPARATOR = `\n\n--- begin citations ---\n`;
const DEBUG_LANGCHAIN_STREAM =
  (process.env.DEBUG_LANGCHAIN_STREAM ?? "").toLowerCase() === "true";

const DEBUG_LANGCHAIN_SEGMENT_SIZE = 60;
const DEBUG_RAG_STEPS =
  (process.env.DEBUG_RAG_STEPS ?? "").toLowerCase() === "true";
const DEBUG_RAG_URLS =
  (process.env.DEBUG_RAG_URLS ?? "").toLowerCase() === "true";
const DEBUG_RAG_MSGS =
  (process.env.DEBUG_RAG_MSGS ?? "").toLowerCase() === "true";

function splitIntoSegments(value: string, size: number): string[] {
  if (!value || size <= 0) {
    return [value];
  }
  const segments: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    segments.push(value.slice(index, index + size));
  }
  return segments;
}

function formatChunkPreview(value: string) {
  // eslint-disable-next-line unicorn/prefer-string-replace-all
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 60) {
    return collapsed;
  }
  return `${collapsed.slice(0, 60)}…`;
}

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
  // Force-exclude detailed logs if DEBUG_RAG_STEPS is false, even if trace is active.
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
    console.log("[rag:langchain] retrieval", stage, payload);
  }

  void trace?.observation({
    name: "rag_retrieval_stage",
    metadata: {
      stage,
      engine: meta?.engine ?? "langchain",
      presetKey: meta?.presetKey ?? meta?.chatConfig?.presetKey ?? "default",
      chatConfig: meta?.chatConfig,
      ragConfig: meta?.chatConfig,
      entries: payload,
    },
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env
  .SUPABASE_SERVICE_ROLE_KEY as string;
const RAG_TOP_K = Number(process.env.RAG_TOP_K || 5);
const DEFAULT_TEMPERATURE = Number(process.env.LLM_TEMPERATURE ?? 0);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase server env is missing");
    }

    const body: ChatRequestBody =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    const sessionConfig =
      (body.sessionConfig || body.config) &&
      typeof (body.sessionConfig || body.config) === "object"
        ? ((body.sessionConfig || body.config) as SessionChatConfig)
        : undefined;

    const guardrails = await getChatGuardrailConfig({ sessionConfig });
    const adminConfig = await getAdminChatConfig();
    const presetId =
      sessionConfig?.presetId ??
      (typeof sessionConfig?.appliedPreset === "string"
        ? sessionConfig.appliedPreset
        : "default");
    const ragRanking = adminConfig.ragRanking;
    const runtime =
      (req as any).chatRuntime ??
      (await loadChatModelSettings({
        forceRefresh: true,
        sessionConfig,
      }));

    const fallbackQuestion =
      typeof body.question === "string" ? body.question : undefined;
    let rawMessages: ChatMessage[] = [];
    if (Array.isArray(body.messages)) {
      rawMessages = sanitizeMessages(body.messages);
    } else if (fallbackQuestion) {
      rawMessages = [{ role: "user", content: fallbackQuestion }];
    }
    const historyWindow = applyHistoryWindow(rawMessages, guardrails);
    const messages = historyWindow.preserved;
    const lastMessage = messages.at(-1);

    if (!lastMessage) {
      return res.status(400).json({ error: "question is required" });
    }

    const question = lastMessage.content;
    const normalizedQuestion = normalizeQuestion(question);
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
    const cacheMeta: {
      responseHit: boolean | null;
      retrievalHit: boolean | null;
    } = {
      responseHit: adminConfig.cache.responseTtlSeconds > 0 ? false : null,
      retrievalHit: adminConfig.cache.retrievalTtlSeconds > 0 ? false : null,
    };
    const includeVerboseDetails = telemetryDecision.includeRetrievalDetails;
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
      embeddingSpaceId: runtime.embeddingSpaceId ?? runtime.embeddingModelId,
      model: runtime.embeddingModel ?? runtime.embeddingModelId ?? undefined,
    });

    const provider = llmSelection.provider;
    const embeddingProvider = embeddingSelection.provider;
    const llmModel = llmSelection.model;
    const embeddingModel = embeddingSelection.model;
    const temperature = parseTemperature(undefined);
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
          name: "langchain-chat-turn",
          sessionId,
          userId,
          input: normalizedQuestion.normalized,
          metadata: traceMetadata,
        })
      : null;
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
      const cached = await memoryCacheClient.get<{
        output: string;
        citations?: string;
      }>(responseCacheKey);
      if (cached) {
        cacheMeta.responseHit = true;
        if (traceMetadata.cache) {
          traceMetadata.cache.responseHit = true;
          void trace?.update({
            metadata: traceMetadata,
            output: cached.output,
          });
        }
        res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8");
        const body =
          cached.citations !== undefined
            ? `${cached.output}${CITATIONS_SEPARATOR}${cached.citations}`
            : cached.output;
        res.end(body);
        return;
      }
    }

    const [{ createClient }, { SupabaseVectorStore }, { PromptTemplate }] =
      await Promise.all([
        import("@supabase/supabase-js"),
        import("@langchain/community/vectorstores/supabase"),
        import("@langchain/core/prompts"),
      ]);

    const embeddings = await createEmbeddingsInstance(embeddingSelection);
    if (DEBUG_RAG_STEPS) {
      console.log("[langchain_chat] guardrails", {
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

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const basePrompt = buildFinalSystemPrompt({
        adminConfig,
        sessionConfig,
      });
      const promptTemplate = [
        escapeForPromptTemplate(basePrompt),
        "",
        "Guardrails:",
        "{intent}",
        "",
        "Conversation summary:",
        "{memory}",
        "",
        "Relevant excerpts:",
        "{context}",
        "",
        "Question:",
        "{question}",
      ].join("\n");
      const prompt = PromptTemplate.fromTemplate(promptTemplate);

      let latestMeta: GuardrailMeta | null = null;
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

      const executeWithResources = async (
        tableName: string,
        queryName: string,
        llmInstance: BaseLanguageModelInterface,
      ): Promise<{ stream: AsyncIterable<string>; citations: Citation[] }> => {
        let contextResult: ContextWindowResult = buildIntentContextFallback(
          routingDecision.intent,
          guardrails,
        );
        let retrievalCacheKey: string | null = null;

        if (routingDecision.intent === "knowledge") {
          if (retrievalCacheTtl > 0) {
            retrievalCacheKey = `chat:retrieval:${presetId}:${hashPayload({
              question: normalizedQuestion.normalized,
              presetId,
              ragTopK: guardrails.ragTopK,
              similarityThreshold: guardrails.similarityThreshold,
            })}`;
            const cachedContext =
              await memoryCacheClient.get<ContextWindowResult>(
                retrievalCacheKey,
              );
            if (cachedContext) {
              cacheMeta.retrievalHit = true;
              contextResult = cachedContext;
              if (traceMetadata.cache) {
                traceMetadata.cache.retrievalHit = true;
              }
            }
          }

          if (cacheMeta.retrievalHit === true) {
            logDebugRag("retrieval-cache", { hit: true, presetId });
          } else {
            const rewrittenQuery = await rewriteQuery(
              normalizedQuestion.normalized,
              {
                enabled: reverseRagEnabled,
                mode: reverseRagMode,
                provider,
                model: llmModel,
              },
            );
            if (trace && reverseRagEnabled) {
              void trace.observation({
                name: "reverse_rag",
                input: normalizedQuestion.normalized,
                output: rewrittenQuery,
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
              rewritten: rewrittenQuery,
            });
            const hydeDocument = await generateHydeDocument(rewrittenQuery, {
              enabled: hydeEnabled,
              provider,
              model: llmModel,
            });
            enhancementSummary = {
              reverseRag: {
                enabled: reverseRagEnabled,
                mode: reverseRagMode,
                original: normalizedQuestion.normalized,
                rewritten: rewrittenQuery,
              },
              hyde: {
                enabled: hydeEnabled,
                generated: hydeDocument ?? null,
              },
              ranker: {
                mode: rankerMode,
              },
            };
            if (trace) {
              void trace.observation({
                name: "hyde",
                input: rewrittenQuery,
                output: hydeDocument,
                metadata: {
                  env,
                  provider,
                  model: llmModel,
                  enabled: hydeEnabled,
                  stage: "hyde",
                },
              });
            }
            logDebugRag("hyde", {
              enabled: hydeEnabled,
              generated: hydeDocument,
            });
            const embeddingTarget = hydeDocument ?? rewrittenQuery;
            logDebugRag("retrieval", {
              query: embeddingTarget,
              mode: rankerMode,
            });
            const queryEmbedding = await embeddings.embedQuery(embeddingTarget);
            const matchCount = Math.max(RAG_TOP_K, guardrails.ragTopK * 2);
            const store = new SupabaseVectorStore(embeddings, {
              client: supabase,
              tableName,
              queryName,
            });
            const matches = await store.similaritySearchVectorWithScore(
              queryEmbedding,
              matchCount,
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
                docId,
                baseSimilarity,
              };
            });

            if (includeVerboseDetails) {
              logRetrievalStage(
                trace,
                "raw_results",
                baseDocs.map((entry) => ({
                  doc_id: entry.docId,
                  similarity: entry.baseSimilarity,
                })),
                {
                  engine: "langchain",
                  presetKey: chatConfigSnapshot?.presetKey,
                  chatConfig: chatConfigSnapshot,
                },
              );
            }

            const docIds = Array.from(
              new Set(
                baseDocs
                  .map((entry) => entry.docId)
                  .filter(
                    (id): id is string =>
                      typeof id === "string" && id.length > 0,
                  ),
              ),
            );

            let metadataRows:
              | { doc_id?: string; metadata?: RagDocumentMetadata | null }[]
              | undefined;
            if (docIds.length > 0) {
              const { data } = await supabase
                .from("rag_documents")
                .select("doc_id, metadata")
                .in("doc_id", docIds);
              metadataRows = data as typeof metadataRows;
            }

            const metadataMap = new Map<string, RagDocumentMetadata | null>();
            for (const row of metadataRows ?? []) {
              const docId = (row as { doc_id?: string }).doc_id;
              if (typeof docId === "string") {
                metadataMap.set(
                  docId,
                  normalizeMetadata(
                    (row as { metadata?: unknown })
                      .metadata as RagDocumentMetadata,
                  ),
                );
              }
            }

            const ragDocs = baseDocs
              .map(({ doc, docId, baseSimilarity }) => {
                const hydratedMeta =
                  (docId ? (metadataMap.get(docId) ?? null) : null) ??
                  normalizeMetadata(doc.metadata as RagDocumentMetadata) ??
                  null;

                if (hydratedMeta?.is_public === false) {
                  return null;
                }

                const weight = computeMetadataWeight(
                  hydratedMeta ?? undefined,
                  ragRanking,
                );
                const finalScore = baseSimilarity * weight;

                return {
                  chunk: doc.pageContent,
                  metadata: {
                    ...doc.metadata,
                    ...hydratedMeta,
                    doc_id:
                      docId ?? (doc.metadata?.doc_id as string | undefined),
                  },
                  similarity: finalScore,
                  base_similarity: baseSimilarity,
                  metadata_weight: weight,
                };
              })
              .filter(
                (
                  doc,
                ): doc is {
                  chunk: string;
                  metadata: any;
                  similarity: number;
                  base_similarity: number;
                  metadata_weight: number;
                } => doc !== null,
              )
              // eslint-disable-next-line unicorn/no-array-sort
              .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

            if (DEBUG_RAG_URLS) {
              const urls = ragDocs
                .map((d) => d.metadata?.source_url)
                .filter(Boolean);
              console.log("[langchain_chat] retrieved urls:", urls);
            }

            if (includeVerboseDetails) {
              logRetrievalStage(
                trace,
                "after_weighting",
                ragDocs.map((doc) => ({
                  doc_id: (doc.metadata?.doc_id as string | null) ?? null,
                  similarity:
                    (doc as { base_similarity?: number }).base_similarity ??
                    null,
                  weight:
                    (doc as { metadata_weight?: number }).metadata_weight ??
                    null,
                  finalScore: doc.similarity ?? null,
                  doc_type:
                    (doc.metadata as { doc_type?: string | null })?.doc_type ??
                    null,
                  persona_type:
                    (doc.metadata as { persona_type?: string | null })
                      ?.persona_type ?? null,
                  is_public:
                    (doc.metadata as { is_public?: boolean | null })
                      ?.is_public ?? null,
                })),
                {
                  engine: "langchain",
                  presetKey: chatConfigSnapshot?.presetKey,
                  chatConfig: chatConfigSnapshot,
                },
              );
            }
            if (trace && includeVerboseDetails) {
              void trace.observation({
                name: "retrieval",
                input: embeddingTarget,
                output: ragDocs,
                metadata: {
                  env,
                  provider,
                  model: llmModel,
                  stage: "retrieval",
                  source: "supabase",
                  results: ragDocs.length,
                  cache: {
                    retrievalHit: cacheMeta.retrievalHit,
                  },
                },
              });
            }
            const rankedDocs = await applyRanker(ragDocs, {
              mode: rankerMode,
              maxResults: Math.max(guardrails.ragTopK, 1),
              embeddingSelection,
              queryEmbedding,
            });
            if (trace && includeVerboseDetails) {
              void trace.observation({
                name: "reranker",
                input: ragDocs,
                output: rankedDocs,
                metadata: {
                  env,
                  provider,
                  model: llmModel,
                  mode: rankerMode,
                  stage: "reranker",
                  results: rankedDocs.length,
                  cache: {
                    retrievalHit: cacheMeta.retrievalHit,
                  },
                },
              });
            }
            contextResult = buildContextWindow(rankedDocs, guardrails);
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
            if (DEBUG_RAG_STEPS) {
              console.log("[langchain_chat] context compression", {
                retrieved:
                  contextResult.included.length + contextResult.dropped,
                ranked: contextResult.included.length + contextResult.dropped,
                included: contextResult.included.length,
                dropped: contextResult.dropped,
                totalTokens: contextResult.totalTokens,
                highestScore: Number(contextResult.highestScore.toFixed(3)),
                insufficient: contextResult.insufficient,
                rankerMode,
              });
            }
          }
        } else {
          console.log("[langchain_chat] intent fallback", {
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

        latestMeta = {
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

        const guardrailMeta = [
          `Intent: ${routingDecision.intent} (${routingDecision.reason})`,
          contextResult.insufficient
            ? "Context status: insufficient matches. Be explicit when information is missing."
            : `Context status: ${contextResult.included.length} excerpts (${contextResult.totalTokens} tokens).`,
        ].join(" | ");
        const contextValue =
          contextResult.contextBlock.length > 0
            ? contextResult.contextBlock
            : "(No relevant context was found.)";
        const memoryValue =
          historyWindow.summaryMemory ??
          "(No summarized prior turns. Treat this as a standalone exchange.)";

        const promptInput = await prompt.format({
          question,
          context: contextValue,
          memory: memoryValue,
          intent: guardrailMeta,
        });

        if (DEBUG_RAG_MSGS) {
          console.log("[langchain_chat] debug context:", {
            length: contextValue.length,
            preview: contextValue.slice(0, 100).replaceAll("\n", "\\n"),
            insufficient: contextResult.insufficient,
          });
          console.log(
            "[langchain_chat] prompt input preview:",
            promptInput.slice(0, 500).replaceAll("\n", "\\n"),
          );
        }

        if (trace) {
          void trace.observation({
            name: "generation",
            input: {
              prompt: promptInput,
              context: contextValue,
            },
            metadata: {
              env,
              provider,
              model: llmModel,
              temperature,
              stage: "generation",
            },
          });
        }
        const stream = await llmInstance.stream(promptInput);
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

        const citations: Citation[] = Array.from(citationMap.values());

        return { stream, citations };
      };

      const primaryTable = getLcChunksView(embeddingSelection);
      const primaryFunction = getLcMatchFunction(embeddingSelection);

      const modelCandidates =
        provider === "gemini" ? getGeminiModelCandidates(llmModel) : [llmModel];
      let lastGeminiError: unknown;

      for (let index = 0; index < modelCandidates.length; index++) {
        const candidate = modelCandidates[index];
        const nextModel = modelCandidates[index + 1];
        const llm = await createChatModel(provider, candidate, temperature);

        try {
          const { stream, citations } = await executeWithResources(
            primaryTable,
            primaryFunction,
            llm,
          );
          res.setHeader("Content-Encoding", "identity");
          if (latestMeta) {
            res.setHeader(
              "X-Guardrail-Meta",
              encodeURIComponent(serializeGuardrailMeta(latestMeta)),
            );
          }
          if (candidate !== llmModel) {
            console.warn(
              `[langchain_chat] Gemini model "${candidate}" succeeded after falling back from "${llmModel}".`,
            );
          }

          let streamHeadersSent = false;
          let finalOutput = "";
          let chunkIndex = 0;
          const ensureStreamHeaders = () => {
            if (!streamHeadersSent) {
              res.writeHead(200, {
                "Content-Type": "text/plain; charset=utf-8",
                "Transfer-Encoding": "chunked",
              });
              streamHeadersSent = true;
            }
          };

          const delayBetweenChunks = DEBUG_LANGCHAIN_STREAM ? 75 : 0;
          const wait = (ms: number) =>
            new Promise((resolve) => setTimeout(resolve, ms));

          try {
            for await (const chunk of stream) {
              const rendered = renderStreamChunk(chunk);
              if (!rendered || res.writableEnded) {
                continue;
              }
              const segments = DEBUG_LANGCHAIN_STREAM
                ? splitIntoSegments(rendered, DEBUG_LANGCHAIN_SEGMENT_SIZE)
                : [rendered];

              for (const segment of segments) {
                if (!segment || res.writableEnded) {
                  continue;
                }
                chunkIndex += 1;
                if (DEBUG_LANGCHAIN_STREAM) {
                  const preview =
                    segment.length > 0
                      ? formatChunkPreview(segment)
                      : "<empty>";
                  console.debug(
                    `[langchain_chat] chunk ${chunkIndex} (${segment.length} chars): ${preview}`,
                  );
                }
                ensureStreamHeaders();
                finalOutput += segment;
                res.write(segment);
                if (delayBetweenChunks > 0) {
                  await wait(delayBetweenChunks);
                }
              }
            }

            ensureStreamHeaders();
            if (DEBUG_LANGCHAIN_STREAM) {
              console.debug(
                `[langchain_chat] stream completed after ${chunkIndex} chunk(s)`,
              );
            }
            if (responseCacheKey) {
              await memoryCacheClient.set(
                responseCacheKey,
                { output: finalOutput, citations },
                responseCacheTtl,
              );
              cacheMeta.responseHit = false;
              if (traceMetadata.cache) {
                traceMetadata.cache.responseHit = false;
              }
            }
            const citationJson = JSON.stringify(citations);
            if (!res.writableEnded) {
              res.write(`${CITATIONS_SEPARATOR}${citationJson}`);
            }
            if (trace) {
              void trace.update({
                output: finalOutput,
                metadata: traceMetadata,
              });
            }
            return res.end();
          } catch (streamErr) {
            if (!streamHeadersSent) {
              if (streamErr instanceof OllamaUnavailableError) {
                return respondWithOllamaUnavailable(res);
              }
              // Graceful handling for LM Studio "No models loaded" error
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
        } catch (err) {
          lastGeminiError = err;
          const shouldRetry =
            provider === "gemini" &&
            Boolean(nextModel) &&
            shouldRetryGeminiModel(candidate, err);

          if (!shouldRetry) {
            throw err;
          }

          console.warn(
            `[langchain_chat] Gemini model "${candidate}" failed (${err instanceof Error ? err.message : String(err)}). Falling back to "${nextModel}".`,
          );
        }
      }

      if (lastGeminiError) {
        throw lastGeminiError;
      }
    }
  } catch (err: any) {
    console.error("[api/langchain_chat] error:", err);
    if (err instanceof OllamaUnavailableError) {
      return respondWithOllamaUnavailable(res);
    }
    return res
      .status(500)
      .json({ error: err?.message || "Internal Server Error" });
  }
}

function parseTemperature(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return DEFAULT_TEMPERATURE;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_TEMPERATURE;
}

function messageContentToString(content: unknown): string {
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
          // LangChain MessageContent-like shapes
          const candidate = entry as {
            type?: string;
            text?: unknown;
            content?: unknown;
            data?: { text?: unknown };
          };

          // Common pattern: { type: "text", text: "..." }
          if (typeof candidate.text === "string") {
            return candidate.text;
          }

          // Some providers may put text in `content`
          if (typeof candidate.content === "string") {
            return candidate.content;
          }

          // Fallback: sometimes nested under data.text
          if (candidate.data && typeof candidate.data.text === "string") {
            return candidate.data.text;
          }
        }

        return "";
      })
      .join("");
  }

  return "";
}

function renderStreamChunk(chunk: unknown): string | null {
  if (!chunk) {
    return null;
  }

  // Already a plain string
  if (typeof chunk === "string") {
    return chunk;
  }

  if (typeof chunk !== "object") {
    return null;
  }

  const anyChunk = chunk as {
    content?: unknown;
    text?: unknown;
    lc_kwargs?: { content?: unknown };
  };

  // Prefer the raw LangChain kwargs content when available (e.g., ChatOllama)
  const rawContent =
    anyChunk.lc_kwargs?.content ?? anyChunk.content ?? anyChunk.text;

  const text = messageContentToString(rawContent);
  return text.length > 0 ? text : null;
}

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

function escapeForPromptTemplate(value: string): string {
  return value.replaceAll("{", "{{").replaceAll("}", "}}");
}

async function createEmbeddingsInstance(
  selection: EmbeddingSpace,
): Promise<EmbeddingsInterface> {
  switch (selection.provider) {
    case "openai": {
      const { OpenAIEmbeddings } = await import("@langchain/openai");
      const apiKey = requireProviderApiKey("openai");
      return new OpenAIEmbeddings({
        model: selection.model,
        apiKey,
      });
    }
    case "gemini": {
      const { GoogleGenerativeAIEmbeddings } =
        await import("@langchain/google-genai");
      const apiKey = requireProviderApiKey("gemini");
      return new GoogleGenerativeAIEmbeddings({
        model: selection.model,
        apiKey,
      });
    }
    default:
      throw new Error(`Unsupported embedding provider: ${selection.provider}`);
  }
}

async function createChatModel(
  provider: ModelProvider,
  modelName: string,
  temperature: number,
): Promise<BaseLanguageModelInterface> {
  switch (provider) {
    case "openai": {
      const { ChatOpenAI } = await import("@langchain/openai");
      const apiKey = requireProviderApiKey("openai");
      return new ChatOpenAI({
        model: modelName,
        apiKey,
        temperature,
        streaming: true,
      });
    }
    case "gemini": {
      const { ChatGoogleGenerativeAI } =
        await import("@langchain/google-genai");
      const apiKey = requireProviderApiKey("gemini");
      return new ChatGoogleGenerativeAI({
        model: modelName,
        apiKey,
        temperature,
        streaming: true,
      });
    }
    case "lmstudio": {
      const { ChatOpenAI } = await import("@langchain/openai");
      const config = getLmStudioRuntimeConfig();
      if (!config.enabled || !config.baseUrl) {
        throw new Error("LM Studio provider is disabled or missing base URL.");
      }
      return new ChatOpenAI({
        model: modelName,
        apiKey: "lm-studio",
        configuration: {
          baseURL: config.baseUrl,
        },
        temperature,
        streaming: true,
      });
    }
    case "ollama": {
      const { ChatOllama } =
        await import("@langchain/community/chat_models/ollama");
      const config = getOllamaRuntimeConfig();
      if (!config.enabled || !config.baseUrl) {
        throw new OllamaUnavailableError(
          "Ollama provider is disabled in this environment.",
        );
      }
      return new ChatOllama({
        baseUrl: config.baseUrl,
        model: modelName ?? config.defaultModel,
        temperature,
      }) as unknown as BaseLanguageModelInterface;
    }
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
