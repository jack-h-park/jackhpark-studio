import { randomUUID } from "node:crypto";

import type { BaseLanguageModelInterface } from "@langchain/core/language_models/base";
import type { NextApiRequest, NextApiResponse } from "next";

import type { GuardrailRoute } from "@/lib/rag/types";
import type {
  RagAutoMode,
  RagMultiQueryMode,
  SessionChatConfig,
} from "@/types/chat-config";
import {
  captureChatCompletion,
  classifyChatCompletionError,
  isPostHogEnabled,
} from "@/lib/analytics/posthog";
import { resolveEmbeddingSpace } from "@/lib/core/embedding-spaces";
import {
  getGeminiModelCandidates,
  shouldRetryGeminiModel,
} from "@/lib/core/gemini";
import { resolveLlmModel } from "@/lib/core/llm-registry";
import { getLcChunksView, getLcMatchFunction } from "@/lib/core/rag-tables";
import { getAppEnv } from "@/lib/langfuse";
import { getLoggingConfig, llmLogger, ragLogger } from "@/lib/logging/logger";
import { buildChatConfigSnapshot } from "@/lib/rag/telemetry";
import { getAdminChatConfig } from "@/lib/server/admin-chat-config";
import { computeHistorySummaryHash } from "@/lib/server/api/chat-cache-keys";
import {
  createChatHttpRuntime,
  setSmokeHeaders,
} from "@/lib/server/api/chat-http-runtime";
import { computeRagContextAndCitations } from "@/lib/server/api/chat-rag-context";
import { createResponseCacheCoordinator } from "@/lib/server/api/chat-response-cache";
import {
  type StreamAnswerResult,
  streamAnswerWithPrompt,
} from "@/lib/server/api/chat-stream-answer";
import {
  createChatTraceState,
  createTraceUpdater,
  finalizeChatTrace,
} from "@/lib/server/api/chat-trace-state";
import {
  createChatModel,
  createEmbeddingsInstance,
} from "@/lib/server/api/llm-provider-factory";
import { hashPayload, memoryCacheClient } from "@/lib/server/chat-cache";
import {
  type ChatRequestBody,
  parseTemperature,
} from "@/lib/server/chat-common";
import {
  applyHistoryWindow,
  getChatGuardrailConfig,
  normalizeQuestion,
  routeQuestion,
  type SanitizationChange,
  sanitizeChatSettings,
} from "@/lib/server/chat-guardrails";
import { type ChatMessage, sanitizeMessages } from "@/lib/server/chat-messages";
import {
  buildFinalSystemPrompt,
  buildRequireLocalBlockedPayload,
  buildRuntimeTelemetryProps,
  loadChatModelSettings,
} from "@/lib/server/chat-settings";
import { createRequestAbortSignal } from "@/lib/server/langchain/abort";
import { type ChainRunContext } from "@/lib/server/langchain/runnable-config";
import { escapeForPromptTemplate } from "@/lib/server/langchain/stream-chunk";
import { respondWithOllamaUnavailable } from "@/lib/server/ollama-errors";
import { OllamaUnavailableError } from "@/lib/server/ollama-provider";
import {
  buildEmbeddingResolutionTrace,
  logEmbeddingResolutionTrace,
} from "@/lib/server/telemetry/embedding-trace";
import { buildCacheMetadata } from "@/lib/server/telemetry/langfuse-metadata";
import {
  attachLangfuseTraceTags,
  buildStableLangfuseTags,
} from "@/lib/server/telemetry/langfuse-tags";
import {
  clearRequestTrace,
  createTelemetryBuffer,
  getRequestTrace,
  type TelemetryContext,
} from "@/lib/server/telemetry/telemetry-buffer";
import { buildTelemetryConfigSnapshot } from "@/lib/server/telemetry/telemetry-config-snapshot";
import { isTelemetryEnabled } from "@/lib/server/telemetry/telemetry-enabled";
import {
  buildSafeTraceInputSummary,
  buildSafeTraceOutputSummary,
} from "@/lib/server/telemetry/telemetry-summaries";
import {
  applyTraceMetadataMerge,
  mergeTraceMetadata,
  type ResponseCacheMeta,
} from "@/lib/server/telemetry/trace-metadata-merge";
import {
  DEFAULT_REVERSE_RAG_MODE,
  type RankerMode,
  type ReverseRagMode,
} from "@/lib/shared/rag-config";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { decideTelemetryMode } from "@/lib/telemetry/chat-langfuse";
import { computeBasePromptVersion } from "@/lib/telemetry/prompt-version";

const telemetryEnabled = isTelemetryEnabled();

const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 1024);

const SUPABASE_URL = process.env.SUPABASE_URL as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env
  .SUPABASE_SERVICE_ROLE_KEY as string;

export async function handleLangchainChat(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const http = createChatHttpRuntime(req, res);
  const {
    startTime,
    mark,
    respondJson,
    runStage,
    scheduleWatchdog,
    clearWatchdog,
    ensureStreamStartedEarly,
    getHeaderValue,
    getDebugFlag,
    logReturn,
  } = http;

  const debugEarlyFlushFlag = getDebugFlag("debug_early_flush");
  const debugNoExternalFlag = getDebugFlag("debug_no_external");

  const body = req.body as ChatRequestBody | null;
  if (!body) {
    respondJson(400, { error: "invalid request body" });
    return;
  }

  const requestIdHeader = getHeaderValue("x-request-id");
  const serverRequestId = requestIdHeader ?? randomUUID();
  const telemetrySessionId = getHeaderValue("x-chat-id");
  const telemetryContext: TelemetryContext = {
    requestId: serverRequestId,
    sessionId: telemetrySessionId,
  };
  const telemetryBuffer = telemetryEnabled
    ? createTelemetryBuffer(telemetryContext)
    : null;
  const pushTelemetryEvent = (
    name: string,
    detail?: Record<string, unknown>,
  ) => {
    if (!telemetryBuffer) {
      return;
    }
    telemetryBuffer.push(name, detail);
  };
  pushTelemetryEvent("handler-start", { method: req.method });
  let telemetryScheduled = false;
  const scheduleTelemetryFlush = () => {
    if (!telemetryBuffer || telemetryScheduled) {
      return;
    }
    telemetryScheduled = true;
    setImmediate(() =>
      telemetryBuffer.flush().catch((err) => {
        console.error("[telemetry] flush error", err);
      }),
    );
  };
  if (telemetryBuffer) {
    res.once("finish", scheduleTelemetryFlush);
    res.once("close", scheduleTelemetryFlush);
  }

  mark("handler-start");
  scheduleWatchdog();
  if (debugEarlyFlushFlag) {
    res.setHeader("X-Debug-Early-Flush", "1");
    ensureStreamStartedEarly("[debug] early-flush\n");
  }
  if (debugNoExternalFlag) {
    res.write("[debug] no-external\n");
    res.end();
    mark("debug-no-external");
    return;
  }

  console.log("[langchain_chat] hit", req.method, req.url);
  llmLogger.debug("[langchain_chat] entering", {
    method: req.method,
    hasBody: req.body !== undefined,
    bodyKeys:
      req.body && typeof req.body === "object" ? Object.keys(req.body) : null,
  });
  const shouldTrackPosthog = isPostHogEnabled();
  let capturePosthogEvent:
    | ((status: "success" | "error", errorType?: string | null) => void)
    | null = null;
  let requestAbortSignal: AbortSignal | null = null;
  let cleanupRequestAbort: (() => void) | null = null;
  const traceState = createChatTraceState();
  const updateTrace = createTraceUpdater(traceState);

  try {
    // Legacy LOG_LLM_LEVEL check removed.
    // Unified logging config handles overrides.

    const abortState = createRequestAbortSignal(req, res);
    http.setAbortController(abortState.controller);
    requestAbortSignal = abortState.signal;
    cleanupRequestAbort = abortState.cleanup;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      respondJson(500, { error: "Supabase server env is missing" });
      return;
    }

    mark("body-validated", {
      hasMessages: Array.isArray(body.messages)
        ? body.messages.length
        : undefined,
      hasQuestion: typeof body.question === "string",
    });

    const sessionConfig =
      (body.sessionConfig || body.config) &&
      typeof (body.sessionConfig || body.config) === "object"
        ? ((body.sessionConfig || body.config) as SessionChatConfig)
        : undefined;

    let guardrails = await runStage("guardrails", () =>
      getChatGuardrailConfig({ sessionConfig }),
    );
    pushTelemetryEvent("guardrails-computed", {
      sessionPreset: sessionConfig?.presetId ?? null,
    });
    const adminConfig = await runStage("admin-config", () =>
      getAdminChatConfig(),
    );
    const ragMultiQueryMaxQueries =
      typeof adminConfig.ragMultiQueryMaxQueries === "number"
        ? adminConfig.ragMultiQueryMaxQueries
        : 2;
    const presetId =
      sessionConfig?.presetId ??
      (typeof sessionConfig?.appliedPreset === "string"
        ? sessionConfig.appliedPreset
        : "default");
    traceState.presetId = presetId;
    pushTelemetryEvent("admin-config", {
      presetId,
      ragRanking: Boolean(adminConfig.ragRanking),
    });
    const ragRanking = adminConfig.ragRanking;
    const runtime =
      (req as any).chatRuntime ??
      (await runStage("runtime", () =>
        loadChatModelSettings({
          forceRefresh: false, // rely on cached runtime to avoid repeated heavy reloads
          sessionConfig,
        }),
      ));
    const safeModeActive = runtime.safeMode;
    const hydeMode: RagAutoMode = safeModeActive
      ? "off"
      : (adminConfig.hydeMode ?? "off");
    const rewriteMode: RagAutoMode = safeModeActive
      ? "off"
      : (adminConfig.rewriteMode ?? "off");
    const ragMultiQueryMode: RagMultiQueryMode = safeModeActive
      ? "off"
      : (adminConfig.ragMultiQueryMode ?? "off");
    const runtimeTelemetryProps = buildRuntimeTelemetryProps(runtime);

    const runtimeFlags = {
      reverseRagEnabled: safeModeActive ? false : runtime.reverseRagEnabled,
      reverseRagMode: (runtime.reverseRagMode ??
        DEFAULT_REVERSE_RAG_MODE) as ReverseRagMode,
      hydeEnabled: safeModeActive ? false : runtime.hydeEnabled,
      rankerMode: safeModeActive ? "none" : (runtime.rankerMode as RankerMode),
    };
    const sanitizedSettings = sanitizeChatSettings({
      guardrails,
      runtimeFlags,
    });
    guardrails = sanitizedSettings.guardrails;
    traceState.guardrails = guardrails;
    const sanitizationChanges: SanitizationChange[] = sanitizedSettings.changes;
    const reverseRagEnabled = sanitizedSettings.runtimeFlags.reverseRagEnabled;
    const reverseRagMode = sanitizedSettings.runtimeFlags.reverseRagMode;
    const hydeEnabled = sanitizedSettings.runtimeFlags.hydeEnabled;
    const rankerMode = sanitizedSettings.runtimeFlags.rankerMode;
    traceState.reverseRagEnabled = reverseRagEnabled;
    traceState.hydeEnabled = hydeEnabled;
    traceState.rankerMode = rankerMode;

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
      logReturn("missing-question");
      respondJson(400, { error: "question is required" });
      return;
    }

    const historySummaryHash = computeHistorySummaryHash(
      historyWindow.summaryMemory,
    );

    const question = lastMessage.content;
    const questionHash = hashPayload({ q: question });
    traceState.question = question;
    traceState.questionHash = questionHash;
    const normalizedQuestion = normalizeQuestion(question);
    const routingDecision = routeQuestion(
      normalizedQuestion,
      messages,
      guardrails,
    );
    traceState.routingDecision = routingDecision;
    const guardrailRoute: GuardrailRoute =
      routingDecision.intent === "chitchat"
        ? "chitchat"
        : routingDecision.intent === "command"
          ? "command"
          : "normal";
    const sessionId = telemetrySessionId ?? serverRequestId;
    const userId =
      typeof req.headers["x-user-id"] === "string"
        ? req.headers["x-user-id"]
        : undefined;
    telemetryContext.question = question;
    traceState.requestId = serverRequestId;
    telemetryBuffer?.updateContext({
      requestId: serverRequestId,
      sessionId: telemetrySessionId ?? serverRequestId,
    });
    pushTelemetryEvent("quadrant-question", {
      questionLength: question.length,
      guardrailRoute,
    });
    const loggingConfig = await runStage("logging-config", () =>
      getLoggingConfig(),
    );
    const { enabled, sampleRate, detailLevel } = loggingConfig.telemetry;
    traceState.detailLevel = detailLevel;
    mark("telemetry-start");
    const telemetryDecision = decideTelemetryMode(
      enabled ? sampleRate : 0,
      detailLevel,
      Math.random,
    );
    const shouldEmitTrace = telemetryDecision.shouldEmitTrace;
    const includeConfigSnapshot = telemetryDecision.includeConfigSnapshot;
    const includeVerboseDetails = telemetryDecision.includeRetrievalDetails;
    const allowPii = process.env.LANGFUSE_INCLUDE_PII === "true";
    traceState.allowPii = allowPii;
    telemetryBuffer?.updateContext({
      includePii: allowPii,
      question,
      safeMode: safeModeActive,
    });
    await telemetryBuffer?.ensureTrace();
    traceState.requestId =
      traceState.requestId ??
      requestIdHeader ??
      sessionId ??
      normalizedQuestion.normalized;
    const trace = traceState.requestId
      ? getRequestTrace(traceState.requestId)
      : null;
    traceState.trace = trace;
    // Surface the Langfuse traceId to the client so it can attach user
    // feedback (👍/👎) to this exact trace. Set early (before any response
    // body) so it covers every exit path: cached, blocked, streamed, error.
    if (trace?.traceId && !res.headersSent) {
      res.setHeader("X-Trace-Id", trace.traceId);
    }
    if (process.env.NODE_ENV !== "production") {
      console.debug("[telemetry] langfuse trace", {
        requestId: traceState.requestId,
        hasTrace: Boolean(trace),
      });
    }
    pushTelemetryEvent("telemetry-decision", {
      shouldEmitTrace,
      includeConfigSnapshot,
      includeVerboseDetails,
    });
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
    const telemetryConfigSnapshot = chatConfigSnapshot
      ? buildTelemetryConfigSnapshot(chatConfigSnapshot)
      : undefined;
    traceState.telemetryConfigSnapshot = telemetryConfigSnapshot;
    const env = await runStage("env-detect", async () => getAppEnv());
    const tracePresetForTag =
      chatConfigSnapshot?.presetKey ?? presetId ?? "unknown";
    attachLangfuseTraceTags({
      trace,
      intent: routingDecision.intent,
      presetKey: tracePresetForTag,
      environment: env,
    });
    const responseCacheTtl = adminConfig.cache.responseTtlSeconds;
    const retrievalCacheTtl = adminConfig.cache.retrievalTtlSeconds;
    const responseCacheEnabled = responseCacheTtl > 0;
    const retrievalCacheEnabled = retrievalCacheTtl > 0;
    const cacheMeta: ResponseCacheMeta = {
      responseHit: responseCacheEnabled ? false : null,
      retrievalHit: retrievalCacheEnabled ? false : null,
    };
    function updateTraceCacheMetadata(): void {
      if (!traceState.metadata) {
        return;
      }
      const cachePayload = buildCacheMetadata({
        intent: routingDecision.intent,
        responseCacheEnabled,
        retrievalCacheEnabled,
        responseCacheHit: cacheMeta.responseHit,
        retrievalCacheHit: cacheMeta.retrievalHit,
      });
      applyTraceMetadataMerge(traceState.metadata, {
        cache: cachePayload.cache,
        responseCacheHit: cachePayload.responseCacheHit,
      });
    }
    function updateRetrievalMetadata(attempted: boolean, used: boolean): void {
      traceState.retrievalAttempted = attempted;
      traceState.retrievalUsed = used;
      if (!traceState.metadata) {
        return;
      }
      applyTraceMetadataMerge(traceState.metadata, {
        rag: {
          retrieval_attempted: attempted,
          retrieval_used: used,
        },
      });
    }
    const initialCacheMetadata = buildCacheMetadata({
      intent: routingDecision.intent,
      responseCacheEnabled,
      retrievalCacheEnabled,
      responseCacheHit: cacheMeta.responseHit,
      retrievalCacheHit: cacheMeta.retrievalHit,
    });
    traceState.metadata = mergeTraceMetadata(traceState.metadata ?? {}, {
      env,
      requestId: traceState.requestId ?? null,
      intent: routingDecision.intent,
      presetId,
      questionHash,
      questionLength: question.length,
      ...(allowPii ? { question } : {}),
      responseCacheStrategy: null,
      aborted: false,
      environment: process.env.NODE_ENV ?? "unknown",
      safe_mode: safeModeActive,
      config: {
        reverseRagEnabled,
        reverseRagMode,
        hydeEnabled,
        rankerMode,
        hydeMode,
        rewriteMode,
        guardrailRoute,
      },
      llmResolution: {
        requestedModelId: runtime.requestedLlmModelId,
        resolvedModelId: runtime.resolvedLlmModelId,
        wasSubstituted: runtime.llmModelWasSubstituted,
        substitutionReason: runtime.llmSubstitutionReason,
      },
      runtime: runtimeTelemetryProps,
      cache: initialCacheMetadata.cache,
      responseCacheHit: initialCacheMetadata.responseCacheHit,
    });
    if (shouldCaptureConfig && chatConfigSnapshot) {
      applyTraceMetadataMerge(traceState.metadata, {
        chatConfig: chatConfigSnapshot,
        ragConfig: chatConfigSnapshot,
      });
    }
    const respondBlockedRequireLocal = () => {
      const payload = buildRequireLocalBlockedPayload(runtime);
      applyTraceMetadataMerge(traceState.metadata, {
        enforcement: runtime.enforcement,
        error_category: payload.error_category,
      });
      updateTrace?.({
        metadata: traceState.metadata ?? undefined,
        output: buildSafeTraceOutputSummary({
          answerChars: 0,
          citationsCount: 0,
          cacheHit: null,
          insufficient: null,
          finishReason: "error",
        }),
      });
      setSmokeHeaders(res, null);
      res.status(503).json(payload);
      capturePosthogEvent?.("error", "local_required_unavailable");
      return;
    };
    const onTraceAbort = () => {
      traceState.finalizeReason = "aborted";
      updateTrace?.({
        output: buildSafeTraceOutputSummary({
          answerChars: 0,
          citationsCount: null,
          cacheHit: null,
          insufficient: null,
          finishReason: "aborted",
        }),
        metadata: { aborted: true },
      });
    };
    if (requestAbortSignal) {
      requestAbortSignal.addEventListener("abort", onTraceAbort, {
        once: true,
      });
    }
    const traceTags = shouldEmitTrace
      ? buildStableLangfuseTags(
          undefined,
          presetId,
          chatConfigSnapshot?.guardrails?.route,
        )
      : undefined;
    updateTrace?.({
      input: buildSafeTraceInputSummary({
        intent: routingDecision.intent,
        model: runtime.llmModel ?? null,
        topK: guardrails.ragTopK,
        historyWindowTokens: historyWindow.tokenCount,
        questionLength: question.length,
        settingsHash: basePromptVersion ?? null,
      }),
      metadata: {
        intent: routingDecision.intent,
        presetId,
        provider: runtime.llmProvider,
        model: runtime.llmModel,
        environment: process.env.NODE_ENV ?? "unknown",
        responseCacheStrategy: null,
        responseCacheHit: null,
        aborted: false,
      },
    });

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
    traceState.provider = provider;
    traceState.llmModel = llmModel;
    const temperature = parseTemperature(undefined);
    updateTrace?.({
      input: buildSafeTraceInputSummary({
        intent: routingDecision.intent,
        model: llmModel,
        topK: guardrails.ragTopK,
        historyWindowTokens: historyWindow.tokenCount,
        questionLength: question.length,
        settingsHash: basePromptVersion ?? null,
      }),
      metadata: {
        provider,
        model: llmModel,
        embeddingProvider,
        embeddingModel,
      },
    });
    if (shouldEmitTrace) {
      pushTelemetryEvent("telemetry-enabled", {
        traceInput,
        metadata: traceState.metadata,
        tags: traceTags,
      });
    }
    mark("telemetry-done");
    if (
      (includeVerboseDetails || env !== "prod") &&
      sanitizationChanges.length > 0
    ) {
      ragLogger.debug("[langchain_chat] settings sanitized", {
        changesCount: sanitizationChanges.length,
        changes: sanitizationChanges,
      });
    }
    const analyticsModelState = {
      provider,
      model: llmModel,
      embeddingModel,
    };
    const chainRunContext: ChainRunContext = {
      requestId: requestIdHeader ?? sessionId ?? normalizedQuestion.normalized,
      sessionId,
      intent: routingDecision.intent,
      guardrailRoute,
      provider,
      llmModel,
      presetId,
      embeddingSelection,
      telemetryDecision,
      // Langfuse traceId (when a trace was emitted) so the LangSmith run
      // metadata carries it too, enabling cross-system trace correlation.
      traceId: traceState.trace?.traceId ?? null,
      langfuseTraceId: traceState.trace?.traceId ?? null,
    };
    traceState.chainRunContext = chainRunContext;
    const resolvePosthogDistinctId = () => {
      const anonymousId =
        typeof req.headers["x-anonymous-id"] === "string"
          ? req.headers["x-anonymous-id"]
          : undefined;
      const candidates = [userId, anonymousId, sessionId, requestIdHeader];
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
        const latencyMs = Date.now() - startTime;
        const llmLatencyMs =
          traceState.llmGenerationStartMs !== null &&
          traceState.llmGenerationEndMs !== null
            ? traceState.llmGenerationEndMs - traceState.llmGenerationStartMs
            : null;
        const aborted = Boolean(requestAbortSignal?.aborted);
        const responseCacheHit = Boolean(cacheMeta.responseHit);
        const retrievalCacheHit = Boolean(cacheMeta.retrievalHit);
        captureChatCompletion({
          distinctId,
          properties: {
            env,
            // Langfuse traceId of this request (null when no trace was
            // emitted), so PostHog events can be joined back to the Langfuse
            // trace for cross-system correlation.
            trace_id: traceState.trace?.traceId ?? null,
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
            latency_llm_ms: llmLatencyMs,
            latency_retrieval_ms: traceState.retrievalLatencyMs,
            aborted,
            total_tokens: traceState.analyticsTotalTokens,
            response_cache_hit: responseCacheHit,
            retrieval_cache_hit: retrievalCacheHit,
            response_cache_enabled: responseCacheEnabled,
            retrieval_cache_enabled: retrievalCacheEnabled,
            status,
            error_type: errorType,
            error_category: errorType ?? undefined,
            ...runtimeTelemetryProps,
            retrieval_attempted: traceState.retrievalAttempted ?? null,
            retrieval_used: traceState.retrievalUsed ?? null,
          },
        });
      };
    };
    capturePosthogEvent = initializePosthogCapture();
    if (runtime.enforcement === "blocked_require_local") {
      return respondBlockedRequireLocal();
    }
    const autoOrMultiEnabled =
      hydeMode === "auto" ||
      rewriteMode === "auto" ||
      ragMultiQueryMode === "auto";
    const responseCache = createResponseCacheCoordinator({
      res,
      responseCacheTtl,
      autoOrMultiEnabled,
      keyInput: {
        presetId,
        intent: routingDecision.intent,
        messages,
        guardrails,
        runtimeFlags: {
          reverseRagEnabled,
          reverseRagMode,
          hydeEnabled,
          rankerMode,
          hydeMode,
          rewriteMode,
          ragMultiQueryMode,
          ragMultiQueryMaxQueries,
        },
        resolvedProvider: provider,
        resolvedModelId: runtime.resolvedLlmModelId ?? runtime.llmModelId ?? llmModel,
        requestedModelId: runtime.requestedLlmModelId ?? runtime.llmModelId ?? null,
        summaryHash: historySummaryHash,
      },
      includeVerboseDetails,
      traceState,
      cacheMeta,
      mark,
      clearWatchdog,
      logReturn,
      updateTrace,
      updateTraceCacheMetadata,
      pushTelemetryEvent,
      capturePosthog: (status, errorType) =>
        capturePosthogEvent?.(status, errorType),
    });

    updateTrace?.({
      metadata: {
        responseCacheStrategy: responseCache.strategy,
      },
    });

    if (!autoOrMultiEnabled && (await responseCache.tryServeFromCache(null))) {
      return;
    }
    if (includeVerboseDetails) {
      ragLogger.debug("[langchain_chat] response cache strategy", {
        responseCacheStrategy: responseCache.strategy,
      });
    }

    const [{ createClient }, { ChatPromptTemplate }] = await Promise.all([
      import("@supabase/supabase-js"),
      import("@langchain/core/prompts"),
    ]);
    mark("imports-ready");

    const embeddings = await createEmbeddingsInstance(embeddingSelection);
    mark("embeddings-ready");
    mark("after-rag-retrieve");
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
    const embeddingRequestId =
      requestIdHeader ?? sessionId ?? normalizedQuestion.normalized;
    const embeddingTrace = runtime.embeddingResolutionSnapshot
      ? buildEmbeddingResolutionTrace(runtime.embeddingResolutionSnapshot, {
          requestId: embeddingRequestId,
          presetKey: presetId,
        })
      : null;
    if (embeddingTrace) {
      logEmbeddingResolutionTrace(embeddingTrace);
    }
    const fallbackFrom = runtime.embeddingResolutionSnapshot.fallbackFrom;
    if (fallbackFrom) {
      ragLogger.info("[embedding] fallback", {
        from: {
          provider: fallbackFrom.provider,
          model: fallbackFrom.model,
          embeddingSpaceId: fallbackFrom.embeddingSpaceId,
        },
        to: {
          provider: embeddingSelection.provider,
          model: embeddingSelection.model,
          embeddingSpaceId: embeddingSelection.embeddingSpaceId,
        },
        reason:
          runtime.embeddingResolutionSnapshot.reason === "provider_disabled"
            ? "disabled"
            : "unknown",
        attemptFrom: 1,
        attemptTo: 2,
        requestId: embeddingRequestId,
      });
    }

    mark("supabase-client-start");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    mark("supabase-client-done");
    const basePrompt = buildFinalSystemPrompt({
      adminConfig,
      sessionConfig,
    });
    const systemTemplate = [
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
    ].join("\n");
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", systemTemplate],
      ["human", "{question}"],
    ]);
    // We also use getSupabaseAdminClient for metadata fetching now to align
    const supabaseAdmin = await runStage("supabase-admin", () =>
      Promise.resolve(getSupabaseAdminClient()),
    );

    const executeWithResources = async (
      tableName: string,
      queryName: string,
      llmInstance: BaseLanguageModelInterface,
      candidateModelId: string,
    ): Promise<boolean> => {
      mark("before-rag-context");
      const includeSelectionTelemetry = Boolean(
        trace &&
        routingDecision.intent === "knowledge" &&
        (detailLevel === "standard" || detailLevel === "verbose"),
      );
      const ragResult = await computeRagContextAndCitations({
        request: {
          guardrails,
          normalizedQuestion,
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
          chainRunContext,
          safeMode: safeModeActive,
          forcedFlags: body?.ragOverride?.forceStrategies,
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
          trace,
          updateTrace: updateTrace ?? undefined,
          updateTraceCacheMetadata,
          updateRetrievalMetadata,
          traceMetadata: traceState.metadata ?? undefined,
          cacheMeta,
        },
        hooks: {
          markStage: mark,
          abortSignal: requestAbortSignal,
        },
      });
      mark("after-rag-context");

      traceState.retrievalLatencyMs = ragResult.retrievalLatencyMs;

      traceState.analyticsTotalTokens =
        ragResult.contextResult.totalTokens ?? null;
      if (ragResult.decisionTelemetry) {
        updateTrace?.({
          metadata: {
            autoTriggered: ragResult.decisionTelemetry.autoTriggered,
            winner: ragResult.decisionTelemetry.winner,
            altType: ragResult.decisionTelemetry.altType,
            multiQueryRan: ragResult.decisionTelemetry.multiQueryRan,
            skippedReason: ragResult.decisionTelemetry.skippedReason ?? null,
          },
        });
      }

      if (
        autoOrMultiEnabled &&
        responseCacheTtl > 0 &&
        (await responseCache.tryServeFromCache(
          ragResult.decisionSignature ?? null,
        ))
      ) {
        return false;
      }

      mark("before-streaming");
      traceState.llmGenerationStartMs = Date.now();
      let streamResult: StreamAnswerResult;
      try {
        streamResult = await streamAnswerWithPrompt({
          promptInput: {
            llmInstance,
            prompt,
            question,
            historyWindow,
          },
          ragOutput: {
            contextResult: ragResult.contextResult,
            citationPayload: ragResult.citations,
            latestMeta: ragResult.latestMeta,
            routingDecision,
          },
          runtime: {
            provider,
            model: llmModel,
            requestedModelId: llmModel,
            candidateModelId,
            responseCacheKey: responseCache.getKey(),
            responseCacheTtl,
            abortSignal: requestAbortSignal,
            chainRunContext,
            initialStreamStarted: http.wasEarlyStreamStarted(),
          },
          http: {
            res,
            respondJson,
            clearWatchdog,
          },
          telemetry: {
            cacheMeta,
            trace,
            updateTrace: updateTrace ?? undefined,
            capturePosthogEvent,
            markStage: (stage, extra) => mark(stage, extra),
            logReturn,
          },
        });
        traceState.llmGenerationEndMs = Date.now();
      } catch (streamErr) {
        traceState.llmGenerationEndMs = Date.now();
        throw streamErr;
      }
      mark("after-streaming");

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
      const llm = await createChatModel(
        provider,
        candidate,
        temperature,
        MAX_TOKENS,
      );

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
        pushTelemetryEvent("stream-success", {
          provider,
          candidate,
          table: primaryTable,
        });
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
    pushTelemetryEvent("handler-error", {
      stage: http.getLastStage(),
      message: err instanceof Error ? err.message : String(err),
    });
    const errorType =
      err instanceof OllamaUnavailableError
        ? "local_llm_unavailable"
        : classifyChatCompletionError(err);
    traceState.errorCategory = errorType;
    traceState.finalizeReason = "error";
    updateTrace?.({
      output: buildSafeTraceOutputSummary({
        answerChars: 0,
        citationsCount: null,
        cacheHit: traceState.metadata?.cache?.responseHit ?? null,
        insufficient: null,
        finishReason: "error",
        errorCategory: traceState.errorCategory,
      }),
      metadata: { aborted: false },
    });
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
      clearWatchdog();
      respondWithOllamaUnavailable(res);
      logReturn("error-ollama-unavailable");
      return;
    }
    respondJson(500, { error: err?.message || "Internal Server Error" });
    logReturn("error-generic-500");
    return;
  } finally {
    finalizeChatTrace(traceState, updateTrace, {
      requestAborted: Boolean(requestAbortSignal?.aborted),
    });
    cleanupRequestAbort?.();
    clearWatchdog();
    if (traceState.requestId) {
      clearRequestTrace(traceState.requestId);
    }
    if (!res.headersSent && !res.writableEnded) {
      respondJson(500, {
        error: "LangChain handler did not produce a response",
      });
      logReturn("finally-safety-net");
    }
  }
}
