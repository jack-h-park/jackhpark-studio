import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { BaseLanguageModelInterface } from "@langchain/core/language_models/base";
import type { PromptTemplate } from "@langchain/core/prompts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

import type { GuardrailRoute } from "@/lib/rag/types";
import type { RagRankingConfig, SessionChatConfig } from "@/types/chat-config";
import {
  captureChatCompletion,
  classifyChatCompletionError,
  isPostHogEnabled,
} from "@/lib/analytics/posthog";
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
import { getAppEnv, langfuse,type LangfuseTrace  } from "@/lib/langfuse";
import { getLoggingConfig, llmLogger, ragLogger } from "@/lib/logging/logger";
import { buildChatConfigSnapshot } from "@/lib/rag/telemetry";
import { getAdminChatConfig } from "@/lib/server/admin-chat-config";
import { hashPayload, memoryCacheClient } from "@/lib/server/chat-cache";
import {
  type ChatRequestBody,
  CITATIONS_SEPARATOR,
  parseTemperature,
} from "@/lib/server/chat-common";
import {
  applyHistoryWindow,
  buildIntentContextFallback,
  type ChatGuardrailConfig,
  type ContextWindowResult,
  estimateTokens,
  getChatGuardrailConfig,
  type HistoryWindowResult,
  type NormalizedQuestion,
  normalizeQuestion,
  type RoutedQuestion,
  routeQuestion,
} from "@/lib/server/chat-guardrails";
import { type ChatMessage, sanitizeMessages } from "@/lib/server/chat-messages";
import { buildFinalSystemPrompt, loadChatModelSettings } from "@/lib/server/chat-settings";
import { createRequestAbortSignal } from "@/lib/server/langchain/abort";
import { buildRagAnswerChain } from "@/lib/server/langchain/ragAnswerChain";
import { buildRagRetrievalChain } from "@/lib/server/langchain/ragRetrievalChain";
import {
  buildChainRunnableConfig,
  type ChainRunContext,
  makeRunName,
} from "@/lib/server/langchain/runnableConfig";
import { respondWithOllamaUnavailable } from "@/lib/server/ollama-errors";
import { OllamaUnavailableError } from "@/lib/server/ollama-provider";
import { logDebugRag } from "@/lib/server/rag-logger";
import {
  type GuardrailEnhancements,
  type GuardrailMeta,
  serializeGuardrailMeta,
} from "@/lib/shared/guardrail-meta";
import { type ModelProvider } from "@/lib/shared/model-provider";
import {
  DEFAULT_REVERSE_RAG_MODE,
  type RankerMode,
  type ReverseRagMode,
} from "@/lib/shared/rag-config";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { decideTelemetryMode } from "@/lib/telemetry/chat-langfuse";
import { computeBasePromptVersion } from "@/lib/telemetry/prompt-version";
import {
  buildCitationPayload,
  type CitationPayload,
} from "@/lib/types/citation";

/**
 * Pages Router API (Node.js runtime).
 * Use Node (not Edge) for LangChain + Supabase clients.
 */
export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" },
  },
};

function formatChunkPreview(value: string) {
  // eslint-disable-next-line unicorn/prefer-string-replace-all
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 60) {
    return collapsed;
  }
  return `${collapsed.slice(0, 60)}…`;
}

const SUPABASE_URL = process.env.SUPABASE_URL as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env
  .SUPABASE_SERVICE_ROLE_KEY as string;
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
  const envTag =
    process.env.NODE_ENV === "production" ? "env:prod" : "env:dev";
  const normalizedPreset =
    typeof presetKey === "string" ? presetKey.trim() : "";
  const presetTag =
    normalizedPreset.length > 0 ? `preset:${normalizedPreset}` : "preset:unknown";
  if (
    normalizedPreset.length === 0 &&
    process.env.NODE_ENV !== "production"
  ) {
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

type TraceMetadataSnapshot = {
  [key: string]: unknown;
  cache?: {
    responseHit: boolean | null;
    retrievalHit: boolean | null;
  };
};

type ResponseCacheMeta = {
  responseHit: boolean | null;
  retrievalHit: boolean | null;
};

interface ComputeRagContextParams {
  guardrails: ChatGuardrailConfig;
  normalizedQuestion: NormalizedQuestion;
  routingDecision: RoutedQuestion;
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
  chatConfigSnapshot: ReturnType<typeof buildChatConfigSnapshot> | undefined;
  includeVerboseDetails: boolean;
  trace: LangfuseTrace | null;
  env: ReturnType<typeof getAppEnv>;
  memoryCacheClient: typeof memoryCacheClient;
  retrievalCacheTtl: number;
  presetId: string;
  cacheMeta: ResponseCacheMeta;
  traceMetadata: TraceMetadataSnapshot | undefined;
  historyWindow: HistoryWindowResult;
  ragRanking?: RagRankingConfig | null;
  abortSignal?: AbortSignal | null;
  chainRunContext: ChainRunContext;
}

interface ComputeRagContextResult {
  contextResult: ContextWindowResult;
  citations: CitationPayload;
  latestMeta: GuardrailMeta;
  enhancementSummary: GuardrailEnhancements;
}

interface StreamAnswerParams {
  llmInstance: BaseLanguageModelInterface;
  prompt: PromptTemplate;
  question: string;
  historyWindow: HistoryWindowResult;
  contextResult: ContextWindowResult;
  citationPayload: CitationPayload;
  latestMeta: GuardrailMeta;
  routingDecision: RoutedQuestion;
  env: ReturnType<typeof getAppEnv>;
  temperature: number;
  requestedModelId: string;
  candidateModelId: string;
  responseCacheKey: string | null;
  responseCacheTtl: number;
  cacheMeta: ResponseCacheMeta;
  trace: LangfuseTrace | null;
  traceMetadata: TraceMetadataSnapshot | undefined;
  res: NextApiResponse;
  capturePosthogEvent:
    | ((status: "success" | "error", errorType?: string | null) => void)
    | null;
  abortSignal?: AbortSignal | null;
  chainRunContext: ChainRunContext;
  logReturn: (label: string) => void;
}

interface StreamAnswerResult {
  finalOutput: string;
  handledEarlyExit?: boolean;
}

async function computeRagContextAndCitations({
  guardrails,
  normalizedQuestion,
  routingDecision,
  reverseRagEnabled,
  reverseRagMode,
  hydeEnabled,
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
  trace,
  env,
  memoryCacheClient,
  retrievalCacheTtl,
  presetId,
  cacheMeta,
  traceMetadata,
  historyWindow,
  ragRanking,
  abortSignal,
  chainRunContext,
}: ComputeRagContextParams): Promise<ComputeRagContextResult> {
  let contextResult = buildIntentContextFallback(
    routingDecision.intent,
    guardrails,
  );
  let citationPayload: CitationPayload | null = null;
  let topKChunks = guardrails.ragTopK;
  let retrievalCacheKey: string | null = null;
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

  if (routingDecision.intent === "knowledge") {
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
      logDebugRag("retrieval-cache", { hit: true, presetId });
    } else {
      const ragChain = buildRagRetrievalChain();
      const ragChainRunnableConfig = buildChainRunnableConfig({
        ...chainRunContext,
        stage: "rag",
      });
      const ragResult = await ragChain.invoke(
        {
          guardrails,
          question: normalizedQuestion.normalized,
          reverseRagEnabled,
          reverseRagMode,
          hydeEnabled,
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
          trace,
          env,
          logDebugRag,
          ragRanking,
          cacheMeta,
        },
        {
          ...ragChainRunnableConfig,
          runName: makeRunName("rag", "root"),
          signal: abortSignal ?? undefined,
        },
      );

      enhancementSummary = ragResult.preRetrieval.enhancementSummary;
      contextResult = ragResult.contextResult;
      topKChunks = Math.max(
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
      ragLogger.debug("[langchain_chat] context compression", {
        retrieved: contextResult.included.length + contextResult.dropped,
        ranked: contextResult.included.length + contextResult.dropped,
        included: contextResult.included.length,
        dropped: contextResult.dropped,
        totalTokens: contextResult.totalTokens,
        highestScore: Number(contextResult.highestScore.toFixed(3)),
        insufficient: contextResult.insufficient,
        rankerMode,
      });
      ragLogger.debug("[langchain_chat] included metadata sample", {
        entries: contextResult.included.map((doc) => ({
          docId:
            (doc.metadata as { doc_id?: string | null })?.doc_id ??
            doc.doc_id ??
            null,
          doc_type: (doc.metadata as { doc_type?: string | null })?.doc_type,
          persona_type: (doc.metadata as { persona_type?: string | null })?.persona_type,
        })),
      });
    }
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

  return {
    contextResult,
    citations: resolvedCitations,
    latestMeta,
    enhancementSummary,
  };
}

async function streamAnswerWithPrompt({
  llmInstance,
  prompt,
  question,
  historyWindow,
  contextResult,
  citationPayload,
  latestMeta,
  routingDecision,
  env,
  temperature,
  requestedModelId,
  candidateModelId,
  responseCacheKey,
  responseCacheTtl,
  cacheMeta,
  trace,
  traceMetadata,
  res,
  abortSignal,
  capturePosthogEvent,
  chainRunContext,
  logReturn,
}: StreamAnswerParams): Promise<StreamAnswerResult> {
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
  const answerChain = buildRagAnswerChain();
  const answerChainRunnableConfig = buildChainRunnableConfig({
    ...chainRunContext,
    stage: "answer",
  });
  const signal = abortSignal ?? undefined;

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

  if (latestMeta) {
    res.setHeader(
      "X-Guardrail-Meta",
      encodeURIComponent(serializeGuardrailMeta(latestMeta)),
    );
  }
  res.setHeader("Content-Encoding", "identity");

  try {
    const answerResult = await answerChain.invoke(
      {
        question,
        guardrailMeta,
        contextValue,
        memoryValue,
        prompt,
        llmInstance,
      },
      {
        ...answerChainRunnableConfig,
        runName: makeRunName("answer", "root"),
        signal,
      },
    );
    const { promptInput, stream } = answerResult;

    if (candidateModelId !== requestedModelId) {
      llmLogger.info(
        `[langchain_chat] Gemini model "${candidateModelId}" succeeded after falling back from "${requestedModelId}".`,
      );
    }

    ragLogger.trace("[langchain_chat] debug context", {
      length: contextValue.length,
      preview: contextValue.slice(0, 100).replaceAll("\n", "\\n"),
      insufficient: contextResult.insufficient,
    });
    ragLogger.trace(
      "[langchain_chat] prompt input preview",
      promptInput.slice(0, 500).replaceAll("\n", "\\n"),
    );

    if (trace) {
      void trace.observation({
        name: "generation",
        input: {
          prompt: promptInput,
          context: contextValue,
        },
        metadata: {
          env,
          provider: latestMeta.provider,
          model: latestMeta.llmModel,
          temperature,
          stage: "generation",
        },
      });
    }

    for await (const chunk of stream) {
      if (abortSignal?.aborted) {
        break;
      }
      const rendered = renderStreamChunk(chunk);
      if (!rendered || res.writableEnded) {
        continue;
      }
      chunkIndex += 1;
      llmLogger.trace("[langchain_chat] stream chunk", {
        chunkIndex,
        length: rendered.length,
        preview: formatChunkPreview(rendered),
      });
      if (abortSignal?.aborted) {
        break;
      }
      ensureStreamHeaders();
      finalOutput += rendered;
      res.write(rendered);
    }

    if (abortSignal?.aborted) {
      return { finalOutput, handledEarlyExit: true };
    }

    ensureStreamHeaders();
    llmLogger.trace("[langchain_chat] stream completed", {
      chunkCount: chunkIndex,
    });
    const citationJson = JSON.stringify(citationPayload);
    if (!abortSignal?.aborted && responseCacheKey) {
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
    if (trace && !abortSignal?.aborted) {
      void trace.update({
        output: finalOutput,
        metadata: traceMetadata,
      });
    }
    res.end();
    return { finalOutput };
  } catch (streamErr) {
    if (abortSignal?.aborted) {
      return { finalOutput, handledEarlyExit: true };
    }
    if (!streamHeadersSent) {
      const errMessage = (streamErr as any)?.message || "";
      if (streamErr instanceof OllamaUnavailableError) {
        capturePosthogEvent?.("error", "local_llm_unavailable");
        respondWithOllamaUnavailable(res);
        logReturn("stream-ollama-unavailable");
        return { finalOutput: "", handledEarlyExit: true };
      }
      if (
        errMessage.includes("No models loaded") ||
        errMessage.includes("connection refused")
      ) {
        capturePosthogEvent?.("error", "local_llm_unavailable");
        res.status(503).json({
          error: {
            code: "LOCAL_LLM_UNAVAILABLE",
            message:
              "LM Studio에 로드된 모델이 없습니다. LM Studio 앱에서 모델을 Load 해주세요.",
          },
        });
        logReturn("stream-local-llm-unavailable");
        return { finalOutput: "", handledEarlyExit: true };
      }
    }
    throw streamErr;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  llmLogger.debug("[langchain_chat] entering", {
    method: req.method,
    hasBody: req.body !== undefined,
    bodyKeys:
      req.body && typeof req.body === "object" ? Object.keys(req.body) : null,
  });
  const logReturn = (label: string) => {
    llmLogger.debug(`[langchain_chat] returning from ${label}`, {
      headersSent: res.headersSent,
      ended: res.writableEnded,
    });
  };

  const requestStart = Date.now();
  const shouldTrackPosthog = isPostHogEnabled();
  let capturePosthogEvent:
    | ((status: "success" | "error", errorType?: string | null) => void)
    | null = null;
  let _analyticsTotalTokens: number | null = null;
  let requestAbortSignal: AbortSignal | null = null;
  let cleanupRequestAbort: (() => void) | null = null;

  try {
    // Legacy LOG_LLM_LEVEL check removed.
    // Unified logging config handles overrides.

    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      const response = res.status(405).json({ error: "Method Not Allowed" });
      logReturn("method-not-allowed");
      return response;
    }

    const abortState = createRequestAbortSignal(req, res);
    requestAbortSignal = abortState.signal;
    cleanupRequestAbort = abortState.cleanup;

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
      const response = res.status(400).json({ error: "question is required" });
      logReturn("missing-question");
      return response;
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
    const cacheMeta: ResponseCacheMeta = {
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
    const rankerMode: RankerMode = runtime.rankerMode;

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
    const requestIdHeader =
      typeof req.headers["x-request-id"] === "string"
        ? req.headers["x-request-id"]
        : undefined;
    const sessionId =
      (req.headers["x-chat-id"] as string) ??
      requestIdHeader ??
      normalizedQuestion.normalized;
    const userId =
      typeof req.headers["x-user-id"] === "string"
        ? req.headers["x-user-id"]
        : undefined;
    if (traceMetadata) {
      traceMetadata.provider = provider;
      traceMetadata.model = llmModel;
      traceMetadata.embeddingProvider = embeddingProvider;
      traceMetadata.embeddingModel = embeddingModel;
    }
    const trace = shouldEmitTrace
      ? langfuse.trace({
          name: "langchain-chat-turn",
          sessionId,
          userId,
          input: traceInput,
          metadata: traceMetadata,
          tags: traceTags,
        }) ?? null
      : null;
    const analyticsModelState = {
      provider,
      model: llmModel,
      embeddingModel,
    };
    const chainRunContext: ChainRunContext = {
      requestId:
        requestIdHeader ?? sessionId ?? normalizedQuestion.normalized,
      sessionId,
      intent: routingDecision.intent,
      guardrailRoute,
      provider,
      llmModel,
      presetId,
      embeddingSelection,
      telemetryDecision,
      traceId: trace?.traceId ?? null,
      langfuseTraceId: trace?.id ?? null,
    };
    const resolvePosthogDistinctId = () => {
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
        requestIdHeader,
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

      return (
        status: "success" | "error",
        errorType: string | null = null,
      ) => {
        if (posthogCaptured) {
          return;
        }
        const distinctId = resolvePosthogDistinctId();
        if (!distinctId) {
          posthogCaptured = true;
          return;
        }
        posthogCaptured = true;
        const latencyMs = Date.now() - requestStart;
        captureChatCompletion({
          distinctId,
          properties: {
            env,
            trace_id: trace?.traceId ?? null,
            chat_session_id: sessionId ?? null,
            preset_key: chatConfigSnapshot?.presetKey ?? presetId ?? "unknown",
            chat_engine: "langchain",
            rag_enabled: guardrails.ragTopK > 0,
            prompt_version:
              chatConfigSnapshot?.prompt?.baseVersion ?? "unknown",
            guardrail_route: guardrailRoute ?? "normal",
            provider: analyticsModelState.provider ?? null,
            model: analyticsModelState.model ?? null,
            embedding_model: analyticsModelState.embeddingModel ?? null,
            latency_ms: latencyMs,
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
      const cached = await memoryCacheClient.get<{
        output: string;
        citations?: string;
      }>(responseCacheKey);
      if (cached) {
        cacheMeta.responseHit = true;
        if (traceMetadata?.cache) {
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
        capturePosthogEvent?.("success", null);
        logReturn("response-cache-hit");
        return;
      }
    }

    const [{ createClient }, { PromptTemplate }] = await Promise.all([
      import("@supabase/supabase-js"),
      import("@langchain/core/prompts"),
    ]);

    const embeddings = await createEmbeddingsInstance(embeddingSelection);
    ragLogger.debug("[langchain_chat] guardrails", {
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
    // We also use getSupabaseAdminClient for metadata fetching now to align
    const supabaseAdmin = getSupabaseAdminClient();

    const executeWithResources = async (
      tableName: string,
      queryName: string,
      llmInstance: BaseLanguageModelInterface,
      candidateModelId: string,
    ): Promise<boolean> => {
      const ragResult = await computeRagContextAndCitations({
        guardrails,
        normalizedQuestion,
        routingDecision,
        reverseRagEnabled,
        reverseRagMode,
        hydeEnabled,
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
        trace,
        env,
        memoryCacheClient,
        retrievalCacheTtl,
        presetId,
        cacheMeta,
        traceMetadata,
        historyWindow,
        ragRanking,
        abortSignal: requestAbortSignal,
        chainRunContext,
      });

      _analyticsTotalTokens =
        ragResult.contextResult.totalTokens ?? null;

      const streamResult = await streamAnswerWithPrompt({
        llmInstance,
        prompt,
        question,
        historyWindow,
        contextResult: ragResult.contextResult,
        citationPayload: ragResult.citations,
        latestMeta: ragResult.latestMeta,
        routingDecision,
        env,
        temperature,
        requestedModelId: llmModel,
        candidateModelId,
        responseCacheKey,
        responseCacheTtl,
        cacheMeta,
        trace,
        traceMetadata,
        res,
        abortSignal: requestAbortSignal,
        capturePosthogEvent,
        chainRunContext,
        logReturn,
      });

      return !streamResult.handledEarlyExit;
    };
    const primaryTable = getLcChunksView(embeddingSelection);
    const primaryFunction = getLcMatchFunction(embeddingSelection);

    const modelCandidates =
      provider === "gemini" ? getGeminiModelCandidates(llmModel) : [llmModel];
    if (modelCandidates.length === 0) {
      throw new Error(
        `No Gemini model candidates resolved for requested model: ${String(llmModel)}`,
      );
    }
    let lastGeminiError: unknown;

    for (let index = 0; index < modelCandidates.length; index++) {
      const candidate = modelCandidates[index];
      const nextModel = modelCandidates[index + 1];
      const llm = await createChatModel(provider, candidate, temperature);

      try {
        const streamSucceeded = await executeWithResources(
          primaryTable,
          primaryFunction,
          llm,
          candidate,
        );
        if (!streamSucceeded) {
          return;
        }
        capturePosthogEvent?.("success", null);
        logReturn("stream-success");
        return;
      } catch (err) {
        lastGeminiError = err;
        const shouldRetry =
          provider === "gemini" &&
          Boolean(nextModel) &&
          shouldRetryGeminiModel(candidate, err);

        if (!shouldRetry) {
          throw err;
        }

        llmLogger.info(
          `[langchain_chat] Gemini model "${candidate}" failed (${err instanceof Error ? err.message : String(err)}). Falling back to "${nextModel}".`,
        );
      }
    }

    if (lastGeminiError) {
      throw lastGeminiError;
    }
  } catch (err: any) {
    const errorType =
      err instanceof OllamaUnavailableError
        ? "local_llm_unavailable"
        : classifyChatCompletionError(err);
    capturePosthogEvent?.("error", errorType);
    llmLogger.error("[api/langchain_chat] error:", { error: err });
    if (res.headersSent) {
      if (!res.writableEnded) {
        res.end();
      }
      logReturn("error-headers-already-sent");
      return;
    }
    if (err instanceof OllamaUnavailableError) {
      const response = respondWithOllamaUnavailable(res);
      logReturn("error-ollama-unavailable");
      return response;
    }
    const response = res
      .status(500)
      .json({ error: err?.message || "Internal Server Error" });
    logReturn("error-generic-500");
    return response;
  } finally {
    cleanupRequestAbort?.();
    if (!res.writableEnded) {
      if (!res.headersSent) {
        res
          .status(500)
          .json({ error: "LangChain handler did not produce a response" });
      } else {
        res.end();
      }
      logReturn("finally-safety-net");
    }
  }
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
