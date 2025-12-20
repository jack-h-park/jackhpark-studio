import { randomUUID } from "node:crypto";

import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { BaseLanguageModelInterface } from "@langchain/core/language_models/base";
import type { PromptTemplate } from "@langchain/core/prompts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

import type { GuardrailRoute } from "@/lib/rag/types";
import type {
  RagAutoMode,
  RagMultiQueryMode,
  RagRankingConfig,
  SessionChatConfig,
} from "@/types/chat-config";
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
import { type AppEnv, getAppEnv, type LangfuseTrace } from "@/lib/langfuse";
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
  buildContextWindow,
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
  type SanitizationChange,
  sanitizeChatSettings,
} from "@/lib/server/chat-guardrails";
import { type ChatMessage, sanitizeMessages } from "@/lib/server/chat-messages";
import {
  buildFinalSystemPrompt,
  loadChatModelSettings,
} from "@/lib/server/chat-settings";
import { isDebugSurfacesEnabled } from "@/lib/server/debug/debug-surfaces";
import { createRequestAbortSignal } from "@/lib/server/langchain/abort";
import {
  mergeCandidates,
  type MultiQueryAltType,
  pickAltQueryType,
} from "@/lib/server/langchain/multi-query";
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
  clearRequestTrace,
  createTelemetryBuffer,
  getRequestTrace,
  type TelemetryContext,
} from "@/lib/server/telemetry/telemetry-buffer";
import { isTelemetryEnabled } from "@/lib/server/telemetry/telemetry-enabled";
import { buildTelemetryMetadata } from "@/lib/server/telemetry/telemetry-metadata";
import {
  buildSafeTraceInputSummary,
  buildSafeTraceOutputSummary,
  mergeSafeTraceInputSummary,
  mergeSafeTraceOutputSummary,
  type SafeTraceInputSummary,
  type SafeTraceOutputSummary,
} from "@/lib/server/telemetry/telemetry-summaries";
import { buildSpanTiming, withSpan } from "@/lib/server/telemetry/withSpan";
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

function formatChunkPreview(value: string) {
  // eslint-disable-next-line unicorn/prefer-string-replace-all
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 60) {
    return collapsed;
  }
  return `${collapsed.slice(0, 60)}…`;
}

const debugSurfacesEnabled = isDebugSurfacesEnabled();
const telemetryEnabled = isTelemetryEnabled();
const SMOKE_HEADERS_ENABLED =
  process.env.SMOKE_HEADERS === "1" || process.env.NODE_ENV !== "production";

function setSmokeHeaders(res: NextApiResponse, cacheHit: boolean | null) {
  if (!SMOKE_HEADERS_ENABLED) {
    return;
  }
  res.setHeader("x-cache-hit", cacheHit === true ? "1" : "0");
}

const AUTO_SCORE_MARGIN = 0.05;
const AUTO_MIN_INCLUDED = 3;
const AUTO_REWRITE_TOKEN_LIMIT = 10;
const AUTO_PASS_TIMEOUT_MS = 2000;
const MULTI_QUERY_TIMEOUT_MS = 1200;
const AUTO_SUPPRESS_TOPK = 18;
const AUTO_SUPPRESS_SIMILARITY = 0.1;

const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 1024);

function buildResponseCacheKeyPayload(args: {
  presetId: string;
  intent: string;
  messages: ChatMessage[];
  guardrails: {
    ragTopK: number;
    similarityThreshold: number;
    ragContextTokenBudget: number;
    ragContextClipTokens: number;
  };
  runtimeFlags: {
    reverseRagEnabled: boolean;
    reverseRagMode: ReverseRagMode;
    hydeEnabled: boolean;
    rankerMode: RankerMode;
    hydeMode: RagAutoMode;
    rewriteMode: RagAutoMode;
    ragMultiQueryMode: RagMultiQueryMode;
    ragMultiQueryMaxQueries: number;
  };
  decision?: RagDecisionSignature | null;
}) {
  const payload = {
    presetId: args.presetId,
    intent: args.intent,
    messages: args.messages,
    guardrails: args.guardrails,
    runtime: args.runtimeFlags,
  } as Record<string, unknown>;

  if (args.decision) {
    payload.decision = args.decision;
  }

  return payload;
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

type TraceMetadataSnapshot = {
  [key: string]: unknown;
  cache?: {
    responseHit: boolean | null;
    retrievalHit: boolean | null;
  };
  retrievalAutoDecision?: AutoDecisionMetrics;
};

type ResponseCacheMeta = {
  responseHit: boolean | null;
  retrievalHit: boolean | null;
};

type TraceUpdate = {
  metadata?: Record<string, unknown>;
  input?: SafeTraceInputSummary;
  output?: SafeTraceOutputSummary;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const mergeBooleanMonotonic = (
  prev: boolean | null | undefined,
  next: boolean | null | undefined,
): boolean | null => {
  if (prev === true || next === true) {
    return true;
  }
  if (prev === false || next === false) {
    return false;
  }
  return null;
};

const mergeNumeric = (
  prev: number | null | undefined,
  next: number | null | undefined,
): number | null => {
  if (typeof prev === "number" && typeof next === "number") {
    return Math.max(prev, next);
  }
  if (typeof next === "number") {
    return next;
  }
  if (typeof prev === "number") {
    return prev;
  }
  return null;
};

const mergeTraceMetadata = (
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> => {
  // ─────────────────────────────────────────────────────────────
  // Telemetry semantic invariant (do not change casually)
  // See: docs/telemetry/telemetry-audit-checklist.md
  // Invariant: metadata merges keep cache/rag flags monotonic and intent first-write-wins.
  // ─────────────────────────────────────────────────────────────
  const merged = { ...prev };
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) {
      continue;
    }
    if (key === "cache" && isPlainObject(value)) {
      // Cache hit flags are monotonic: once true, never revert to false.
      const prior = isPlainObject(merged.cache) ? merged.cache : {};
      merged.cache = {
        ...prior,
        responseHit: mergeBooleanMonotonic(
          prior.responseHit as boolean | null | undefined,
          value.responseHit as boolean | null | undefined,
        ),
        retrievalHit: mergeBooleanMonotonic(
          prior.retrievalHit as boolean | null | undefined,
          value.retrievalHit as boolean | null | undefined,
        ),
      };
      continue;
    }
    if (key === "rag" && isPlainObject(value)) {
      // Retrieval flags are monotonic so cache-hit inference stays stable.
      const prior = isPlainObject(merged.rag) ? merged.rag : {};
      const base = mergeTraceMetadata(prior, value);
      merged.rag = {
        ...base,
        retrieval_attempted: mergeBooleanMonotonic(
          prior.retrieval_attempted as boolean | null | undefined,
          value.retrieval_attempted as boolean | null | undefined,
        ),
        retrieval_used: mergeBooleanMonotonic(
          prior.retrieval_used as boolean | null | undefined,
          value.retrieval_used as boolean | null | undefined,
        ),
      };
      continue;
    }
    if (key === "intent" && typeof value === "string") {
      // Intent is first-write-wins; record any later changes as *_final.
      const prevIntent = merged.intent;
      if (typeof prevIntent === "string" && prevIntent !== value) {
        merged.intent_prev = merged.intent_prev ?? prevIntent;
        merged.intent_final = value;
        continue;
      }
      merged.intent = value;
      continue;
    }
    if (key === "aborted" && typeof value === "boolean") {
      // Aborts are terminal: once true, never flip back to false.
      merged.aborted = mergeBooleanMonotonic(
        merged.aborted as boolean | null | undefined,
        value,
      );
      continue;
    }
    if (typeof value === "number") {
      // Numeric counters move monotonically for stable dashboards.
      merged[key] = mergeNumeric(
        merged[key] as number | null | undefined,
        value,
      );
      continue;
    }
    if (isPlainObject(value)) {
      const prior = isPlainObject(merged[key])
        ? (merged[key] as Record<string, unknown>)
        : {};
      merged[key] = mergeTraceMetadata(prior, value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
};

const applyTraceMetadataMerge = (
  target: TraceMetadataSnapshot | null | undefined,
  updates: Record<string, unknown>,
) => {
  if (!target) {
    return;
  }
  const merged = mergeTraceMetadata(target, updates);
  Object.assign(target, merged);
};

interface ComputeRagContextParams {
  guardrails: ChatGuardrailConfig;
  normalizedQuestion: NormalizedQuestion;
  routingDecision: RoutedQuestion;
  reverseRagEnabled: boolean;
  reverseRagMode: ReverseRagMode;
  hydeEnabled: boolean;
  hydeMode: RagAutoMode;
  rewriteMode: RagAutoMode;
  ragMultiQueryMode: RagMultiQueryMode;
  ragMultiQueryMaxQueries: number;
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
  includeSelectionTelemetry: boolean;
  env: AppEnv;
  memoryCacheClient: typeof memoryCacheClient;
  retrievalCacheTtl: number;
  presetId: string;
  cacheMeta: ResponseCacheMeta;
  traceMetadata: TraceMetadataSnapshot | undefined;
  trace?: LangfuseTrace | null;
  updateTrace?: (updates: TraceUpdate) => void;
  historyWindow: HistoryWindowResult;
  ragRanking?: RagRankingConfig | null;
  abortSignal?: AbortSignal | null;
  chainRunContext: ChainRunContext;
  markStage?: (stage: string, extra?: Record<string, unknown>) => void;
}

interface ComputeRagContextResult {
  contextResult: ContextWindowResult;
  citations: CitationPayload;
  latestMeta: GuardrailMeta;
  enhancementSummary: GuardrailEnhancements;
  decisionSignature?: RagDecisionSignature;
  decisionTelemetry?: RagDecisionTelemetry;
}

type AutoBaseDecision = {
  baseEnabled: boolean;
  autoAllowed: boolean;
};

type RetrievalPassMetrics = {
  pass: "base" | "auto";
  firedHyde: boolean;
  firedRewrite: boolean;
  highestScore: number | null;
  includedCount: number;
  droppedCount: number;
  insufficient: boolean;
  tookMs: number;
};

type AutoDecisionMetrics = {
  enabledHydeMode: RagAutoMode;
  enabledRewriteMode: RagAutoMode;
  enabledMultiQueryMode: RagMultiQueryMode;
  autoTriggered: boolean;
  winner: "base" | "auto" | null;
  base: RetrievalPassMetrics;
  auto?: RetrievalPassMetrics;
  multiQuery?: {
    enabled: boolean;
    ran: boolean;
    altType: MultiQueryAltType;
    mergedCandidates: number;
    baseCandidates: number;
    altCandidates: number;
    tookMsAlt?: number;
    skippedReason?:
      | "not_enabled"
      | "not_weak"
      | "no_alt"
      | "aborted"
      | "timeout"
      | "error";
  };
};

type RagDecisionSignature = {
  autoTriggered: boolean;
  winner: "base" | "auto" | null;
  altType: MultiQueryAltType;
  multiQueryRan: boolean;
  altQueryHash?: string | null;
};

type MultiQuerySkipReason =
  | "not_enabled"
  | "not_weak"
  | "no_alt"
  | "aborted"
  | "timeout"
  | "error";

type RagDecisionTelemetry = {
  autoTriggered: boolean;
  winner: "base" | "auto" | null;
  altType: MultiQueryAltType;
  multiQueryRan: boolean;
  skippedReason?: MultiQuerySkipReason;
};

function resolveAutoMode(
  mode: RagAutoMode,
  baseEnabled: boolean,
): AutoBaseDecision {
  if (mode === "on") {
    return { baseEnabled: true, autoAllowed: false };
  }
  if (mode === "auto") {
    return { baseEnabled, autoAllowed: !baseEnabled };
  }
  return { baseEnabled, autoAllowed: false };
}

function isWeakRetrieval(
  result: ContextWindowResult,
  similarityThreshold: number,
  finalK: number,
): boolean {
  return (
    result.insufficient ||
    result.highestScore < similarityThreshold + AUTO_SCORE_MARGIN ||
    result.included.length < Math.min(finalK, AUTO_MIN_INCLUDED)
  );
}

function selectBetterRetrieval(
  baseResult: ContextWindowResult,
  autoResult: ContextWindowResult,
): "base" | "auto" {
  if (autoResult.highestScore !== baseResult.highestScore) {
    return autoResult.highestScore > baseResult.highestScore ? "auto" : "base";
  }
  if (autoResult.included.length !== baseResult.included.length) {
    return autoResult.included.length > baseResult.included.length
      ? "auto"
      : "base";
  }
  if (autoResult.insufficient !== baseResult.insufficient) {
    return autoResult.insufficient ? "base" : "auto";
  }
  return "base";
}

class AutoPassTimeoutError extends Error {
  constructor() {
    super("auto-pass-timeout");
  }
}

function buildPassMetrics(
  pass: "base" | "auto",
  result: ContextWindowResult,
  firedHyde: boolean,
  firedRewrite: boolean,
  tookMs: number,
): RetrievalPassMetrics {
  return {
    pass,
    firedHyde,
    firedRewrite,
    highestScore: Number.isFinite(result.highestScore)
      ? Number(result.highestScore.toFixed(3))
      : null,
    includedCount: result.included.length,
    droppedCount: result.dropped ?? 0,
    insufficient: result.insufficient,
    tookMs,
  };
}

function buildFailedAutoMetrics(
  firedHyde: boolean,
  firedRewrite: boolean,
  tookMs: number,
): RetrievalPassMetrics {
  return {
    pass: "auto",
    firedHyde,
    firedRewrite,
    highestScore: null,
    includedCount: 0,
    droppedCount: 0,
    insufficient: true,
    tookMs,
  };
}

function shouldSuppressAuto(guardrails: ChatGuardrailConfig): boolean {
  // Suppress auto when user settings already favor high recall.
  return (
    guardrails.ragTopK >= AUTO_SUPPRESS_TOPK &&
    guardrails.similarityThreshold <= AUTO_SUPPRESS_SIMILARITY
  );
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
  env: AppEnv;
  temperature: number;
  provider: ModelProvider;
  model: string;
  requestedModelId: string;
  candidateModelId: string;
  responseCacheKey: string | null;
  responseCacheTtl: number;
  cacheMeta: ResponseCacheMeta;
  traceMetadata: TraceMetadataSnapshot | undefined;
  res: NextApiResponse;
  respondJson: (status: number, payload: unknown) => void;
  clearWatchdog: () => void;
  capturePosthogEvent:
    | ((status: "success" | "error", errorType?: string | null) => void)
    | null;
  markStage?: (stage: string, extra?: Record<string, unknown>) => void;
  abortSignal?: AbortSignal | null;
  chainRunContext: ChainRunContext;
  logReturn: (label: string) => void;
  initialStreamStarted: boolean;
  trace?: LangfuseTrace | null;
  updateTrace?: (updates: TraceUpdate) => void;
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
  hydeMode,
  rewriteMode,
  ragMultiQueryMode,
  ragMultiQueryMaxQueries,
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
  trace = null,
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
  markStage,
  updateTrace,
  includeSelectionTelemetry,
}: ComputeRagContextParams): Promise<ComputeRagContextResult> {
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

  if (routingDecision.intent === "knowledge") {
    const finalK = guardrails.ragTopK;
    const CANDIDATE_MULTIPLIER = 5;
    const CANDIDATE_MIN = 20;
    const CANDIDATE_MAX = 80;
    const candidateK = Math.max(
      CANDIDATE_MIN,
      Math.min(CANDIDATE_MAX, finalK * CANDIDATE_MULTIPLIER),
    );
    const reverseRagDecision = resolveAutoMode(rewriteMode, reverseRagEnabled);
    const hydeDecision = resolveAutoMode(hydeMode, hydeEnabled);
    const questionTokens = estimateTokens(normalizedQuestion.normalized);
    if (retrievalCacheTtl > 0) {
      retrievalCacheKey = `chat:retrieval:${presetId}:${hashPayload({
        question: normalizedQuestion.normalized,
        presetId,
        ragTopK: guardrails.ragTopK,
        similarityThreshold: guardrails.similarityThreshold,
        candidateK,
        reverseRagEnabled: reverseRagDecision.baseEnabled,
        reverseRagMode,
        hydeEnabled: hydeDecision.baseEnabled,
        rankerMode,
        hydeMode,
        rewriteMode,
        ragMultiQueryMode,
        ragMultiQueryMaxQueries,
        altQueryType: "none",
      })}`;
      retrievalCacheWriteKey = retrievalCacheKey;
      const cachedContext =
        await memoryCacheClient.get<ContextWindowResult>(retrievalCacheKey);
      if (cachedContext) {
        cacheMeta.retrievalHit = true;
        contextResult = cachedContext;
        applyTraceMetadataMerge(traceMetadata, {
          cache: { retrievalHit: true },
          rag: { retrieval_used: true },
        });
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
          reverseRagEnabled: reverseRagDecision.baseEnabled,
          hydeEnabled: hydeDecision.baseEnabled,
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
        const shouldAutoRewrite =
          reverseRagDecision.autoAllowed &&
          (baseWeak || questionTokens < AUTO_REWRITE_TOKEN_LIMIT) &&
          !suppressAuto;
        const shouldAutoHyde =
          hydeDecision.autoAllowed && baseWeak && !suppressAuto;

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
            mergedCandidates: baseResult.rankedDocs.length,
            baseCandidates: baseResult.rankedDocs.length,
            altCandidates: autoResult?.rankedDocs?.length ?? 0,
            tookMsAlt: autoDecisionMetrics.auto?.tookMs,
            skippedReason,
          };
        }

        if (shouldRunMultiQuery && autoResult) {
          const altQueryHash = hashPayload({
            altType: altQueryType,
            query: autoResult.preRetrieval.embeddingTarget,
          });
          if (retrievalCacheTtl > 0) {
            retrievalCacheWriteKey = `chat:retrieval:${presetId}:${hashPayload({
              question: normalizedQuestion.normalized,
              presetId,
              ragTopK: guardrails.ragTopK,
              similarityThreshold: guardrails.similarityThreshold,
              candidateK,
              reverseRagEnabled: reverseRagDecision.baseEnabled,
              reverseRagMode,
              hydeEnabled: hydeDecision.baseEnabled,
              rankerMode,
              hydeMode,
              rewriteMode,
              ragMultiQueryMode,
              ragMultiQueryMaxQueries,
              altQueryType,
              altQueryHash,
            })}`;
          }
          const mergedCandidates = mergeCandidates(
            baseResult.rankedDocs,
            autoResult.rankedDocs,
          );
          const mergedContext = buildContextWindow(mergedCandidates, guardrails, {
            includeVerboseDetails,
            includeSelectionMetadata: includeSelectionTelemetry,
          });
          contextResult = mergedContext;
          if (autoDecisionMetrics?.multiQuery) {
            autoDecisionMetrics.multiQuery = {
              ...autoDecisionMetrics.multiQuery,
              ran: true,
              mergedCandidates: mergedCandidates.length,
              baseCandidates: baseResult.rankedDocs.length,
              altCandidates: autoResult.rankedDocs.length,
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
          applyTraceMetadataMerge(traceMetadata, {
            cache: { retrievalHit: false },
          });
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
        }
      }
    }
  }

  if (
    routingDecision.intent !== "knowledge" &&
    cacheMeta.retrievalHit !== null
  ) {
    cacheMeta.retrievalHit = null;
    applyTraceMetadataMerge(traceMetadata, {
      cache: { retrievalHit: null },
    });
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

  if (traceMetadata && includeVerboseDetails && autoDecisionMetrics) {
    applyTraceMetadataMerge(traceMetadata, {
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
  env: _env,
  temperature: _temperature,
  requestedModelId,
  candidateModelId,
  responseCacheKey,
  responseCacheTtl,
  cacheMeta,
  traceMetadata,
  res,
  respondJson,
  clearWatchdog,
  markStage,
  abortSignal,
  capturePosthogEvent,
  chainRunContext,
  logReturn,
  initialStreamStarted,
  provider,
  model,
  trace,
  updateTrace,
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

  // Build a formatted transcript of the most recent turns (preserved messages)
  // that are not already part of the summarized summaryMemory.
  const transcriptLines: string[] = [];
  const questionNormalized = question?.trim();

  // Robustly exclude the current question from the history transcript.
  // We identify the last message that matches the current user question to avoid
  // duplicating it in the {memory} section, as it's already in the {question} section.
  let excludeIndex = -1;
  if (questionNormalized) {
    for (let i = historyWindow.preserved.length - 1; i >= 0; i -= 1) {
      const m = historyWindow.preserved[i];
      if (m.role === "user" && m.content?.trim() === questionNormalized) {
        excludeIndex = i;
        break;
      }
    }
  }

  for (let i = 0; i < historyWindow.preserved.length; i++) {
    if (i === excludeIndex) continue;
    const m = historyWindow.preserved[i];
    const roleLabel = m.role === "user" ? "User" : "Assistant";
    transcriptLines.push(`${roleLabel}: ${m.content}`);
  }

  const preservedTranscript = transcriptLines.join("\n");

  // Combine summarized old history and recent transcript with clear section headers.
  const memoryParts: string[] = [];
  const summaryMemory = historyWindow.summaryMemory?.trim();
  if (summaryMemory) {
    memoryParts.push(`Summary of earlier conversation:\n${summaryMemory}`);
  }
  if (preservedTranscript) {
    memoryParts.push(
      `Most recent conversation transcript:\n${preservedTranscript}`,
    );
  }

  const memoryValue =
    memoryParts.length > 0
      ? memoryParts.join("\n\n")
      : "(No prior conversation history. Treat this as a standalone exchange.)";
  const answerChain = buildRagAnswerChain();
  const answerChainRunnableConfig = buildChainRunnableConfig({
    ...chainRunContext,
    stage: "answer",
  });
  const signal = abortSignal ?? undefined;

  let streamHeadersSent = initialStreamStarted;
  let finalOutput = "";
  let chunkIndex = 0;
  const ensureStreamHeaders = () => {
    if (res.headersSent) {
      streamHeadersSent = true;
      return;
    }
    if (!streamHeadersSent) {
      setSmokeHeaders(res, cacheMeta.responseHit);
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

  const emitTraceOutput = (aborted: boolean) => {
    if (!updateTrace) {
      return;
    }
    const citationsCount = citationPayload?.citations?.length ?? 0;
    const canInferInsufficient = routingDecision.intent === "knowledge";
    updateTrace?.({
      output: buildSafeTraceOutputSummary({
        answerChars: finalOutput.length,
        citationsCount,
        cacheHit: cacheMeta.responseHit,
        insufficient: canInferInsufficient ? contextResult.insufficient : null,
        finishReason: aborted ? "aborted" : "success",
      }),
      metadata: {
        aborted,
      },
    });
  };

  const answerMetadata = buildTelemetryMetadata({
    kind: "llm",
    requestId: chainRunContext.requestId ?? null,
    generationProvider: provider,
    generationModel: model,
    additional: {
      responseCacheHit: cacheMeta.responseHit,
    },
  });
  let handledEarlyExit = false;

  try {
    await withSpan(
      {
        trace,
        requestId: chainRunContext.requestId ?? null,
        name: "answer:llm",
        metadata: answerMetadata,
      },
      async () => {
        try {
          markStage?.("before-llm-call");
          markStage?.("answer-chain-invoked");
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
          markStage?.("stream-loop-started");

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
            if (chunkIndex === 1) {
              markStage?.("first-chunk-sent", {
                chunkIndex,
                chunkLength: rendered.length,
              });
              markStage?.("after-llm-first-byte", {
                chunkIndex,
                chunkLength: rendered.length,
              });
            }
            if (abortSignal?.aborted) {
              break;
            }
            ensureStreamHeaders();
            finalOutput += rendered;
            res.write(rendered);
          }

          if (abortSignal?.aborted) {
            answerMetadata.aborted = true;
            answerMetadata.finishReason = "aborted";
            emitTraceOutput(true);
            handledEarlyExit = true;
            return;
          }

          ensureStreamHeaders();
          llmLogger.trace("[langchain_chat] stream completed", {
            chunkCount: chunkIndex,
          });
          answerMetadata.aborted = false;
          answerMetadata.finishReason = "success";
          emitTraceOutput(false);
        } catch (spanErr) {
          answerMetadata.aborted = true;
          answerMetadata.finishReason = "error";
          throw spanErr;
        }
      },
    );

    if (handledEarlyExit) {
      return { finalOutput, handledEarlyExit: true };
    }

    const citationJson = JSON.stringify(citationPayload);
    if (!abortSignal?.aborted && responseCacheKey) {
      await memoryCacheClient.set(
        responseCacheKey,
        { output: finalOutput, citations: citationJson },
        responseCacheTtl,
      );
      cacheMeta.responseHit = false;
      applyTraceMetadataMerge(traceMetadata, {
        cache: { responseHit: false },
      });
    }
    if (!res.writableEnded) {
      res.write(`${CITATIONS_SEPARATOR}${citationJson}`);
    }
    // Trace updates moved to telemetry buffer flush.
    res.end();
    markStage?.("response-end");
    markStage?.("stream-completed");
    return { finalOutput };
  } catch (streamErr) {
    if (abortSignal?.aborted) {
      emitTraceOutput(true);
      return { finalOutput, handledEarlyExit: true };
    }
    if (!res.headersSent) {
      const errMessage = (streamErr as any)?.message || "";
      if (streamErr instanceof OllamaUnavailableError) {
        capturePosthogEvent?.("error", "local_llm_unavailable");
        markStage?.("stream-ollama-unavailable");
        clearWatchdog();
        respondWithOllamaUnavailable(res);
        logReturn("stream-ollama-unavailable");
        return { finalOutput: "", handledEarlyExit: true };
      }
      if (
        errMessage.includes("No models loaded") ||
        errMessage.includes("connection refused")
      ) {
        capturePosthogEvent?.("error", "local_llm_unavailable");
        markStage?.("stream-local-llm-unavailable");
        respondJson(503, {
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

export async function handleLangchainChat(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const logReturn = (label: string) => {
    llmLogger.debug(`[langchain_chat] returning from ${label}`, {
      headersSent: res.headersSent,
      ended: res.writableEnded,
    });
  };

  const startTime = Date.now();
  let lastStage = "handler-start";
  let watchdogTimer: NodeJS.Timeout | null = null;
  const WATCHDOG_TIMEOUT_MS = 10_000;
  let abortController: AbortController | null = null;

  const clearWatchdog = () => {
    if (watchdogTimer) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  };

  const mark = (stage: string, extra?: Record<string, unknown>) => {
    lastStage = stage;
    llmLogger.debug("[langchain_chat] stage", {
      stage,
      elapsedMs: Date.now() - startTime,
      headersSent: res.headersSent,
      writableEnded: res.writableEnded,
      ...extra,
    });
    if (res.headersSent) {
      clearWatchdog();
    }
  };

  const respondJson = (status: number, payload: unknown) => {
    clearWatchdog();
    if (res.headersSent) {
      res.write(`\n${JSON.stringify(payload)}`);
      res.end();
      return;
    }
    res.status(status).json(payload);
  };

  class StageTimeoutError extends Error {
    constructor(public stage: string) {
      super(`stage-timeout:${stage}`);
    }
  }

  const STAGE_TIMEOUT_MS =
    process.env.NODE_ENV === "production" ? 8000 : 15_000;

  const runStage = async <T>(
    stage: string,
    action: () => Promise<T>,
  ): Promise<T> => {
    mark(`${stage}-start`);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new StageTimeoutError(stage)),
        STAGE_TIMEOUT_MS,
      );
    });
    try {
      const result = await Promise.race([action(), timeoutPromise]);
      mark(`${stage}-done`);
      return result;
    } catch (err) {
      if (err instanceof StageTimeoutError) {
        mark("timeout", { stage: err.stage });
        if (!res.headersSent && !res.writableEnded) {
          respondJson(504, {
            error: "stage timeout",
            stage: err.stage,
            timeoutMs: STAGE_TIMEOUT_MS,
          });
        }
      }
      throw err;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };

  const triggerWatchdog = () => {
    if (watchdogTimer) {
      clearWatchdog();
    }
    const timeoutStage = lastStage;
    llmLogger.error("[langchain_chat] watchdog-timeout", {
      stage: timeoutStage,
      elapsedMs: Date.now() - startTime,
    });
    if (!res.headersSent && !res.writableEnded) {
      respondJson(504, {
        error: "Chat request timed out before response started",
        stage: timeoutStage,
      });
    }
    abortController?.abort();
  };

  const scheduleWatchdog = () => {
    if (watchdogTimer) {
      return;
    }
    watchdogTimer = setTimeout(triggerWatchdog, WATCHDOG_TIMEOUT_MS);
  };

  let earlyStreamStarted = false;
  const ensureStreamStartedEarly = (marker?: string) => {
    if (res.headersSent || earlyStreamStarted) {
      earlyStreamStarted = true;
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    });
    const defaultMarker =
      process.env.NODE_ENV === "production" ? "\n" : "[early-stream]\n";
    res.write(marker ?? defaultMarker);
    if (typeof (res as any).flushHeaders === "function") {
      (res as any).flushHeaders();
    }
    earlyStreamStarted = true;
  };

  const getHeaderValue = (name: string): string | undefined => {
    const value = req.headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value.find(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      );
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    return undefined;
  };

  const getDebugFlag = (key: string) => {
    if (!debugSurfacesEnabled) {
      return false;
    }
    const queryValue = req.query[key];
    if (Array.isArray(queryValue)) {
      return queryValue.includes("1");
    }
    return queryValue === "1";
  };

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
  const requestStart = Date.now();
  const shouldTrackPosthog = isPostHogEnabled();
  let capturePosthogEvent:
    | ((status: "success" | "error", errorType?: string | null) => void)
    | null = null;
  let _analyticsTotalTokens: number | null = null;
  let requestAbortSignal: AbortSignal | null = null;
  let cleanupRequestAbort: (() => void) | null = null;
  let traceRequestId: string | null = null;
  let traceMetadata: TraceMetadataSnapshot | null = null;
  let traceInputSummary: SafeTraceInputSummary | null = null;
  let traceOutputSummary: SafeTraceOutputSummary | null = null;
  let finalizeReason: SafeTraceOutputSummary["finish_reason"] | null = null;
  let errorCategory: string | null = null;
  let updateTrace: ((updates: TraceUpdate) => void) | null = null;

  try {
    // Legacy LOG_LLM_LEVEL check removed.
    // Unified logging config handles overrides.

    const abortState = createRequestAbortSignal(req, res);
    abortController = abortState.controller;
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
    const hydeMode: RagAutoMode = adminConfig.hydeMode ?? "off";
    const rewriteMode: RagAutoMode = adminConfig.rewriteMode ?? "off";
    const ragMultiQueryMode: RagMultiQueryMode =
      adminConfig.ragMultiQueryMode ?? "off";
    const ragMultiQueryMaxQueries =
      typeof adminConfig.ragMultiQueryMaxQueries === "number"
        ? adminConfig.ragMultiQueryMaxQueries
        : 2;
    const presetId =
      sessionConfig?.presetId ??
      (typeof sessionConfig?.appliedPreset === "string"
        ? sessionConfig.appliedPreset
        : "default");
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

    const runtimeFlags = {
      reverseRagEnabled: runtime.reverseRagEnabled,
      reverseRagMode: (runtime.reverseRagMode ??
        DEFAULT_REVERSE_RAG_MODE) as ReverseRagMode,
      hydeEnabled: runtime.hydeEnabled,
      rankerMode: runtime.rankerMode as RankerMode,
    };
    const sanitizedSettings = sanitizeChatSettings({
      guardrails,
      runtimeFlags,
    });
    guardrails = sanitizedSettings.guardrails;
    const sanitizationChanges: SanitizationChange[] = sanitizedSettings.changes;
    const reverseRagEnabled = sanitizedSettings.runtimeFlags.reverseRagEnabled;
    const reverseRagMode = sanitizedSettings.runtimeFlags.reverseRagMode;
    const hydeEnabled = sanitizedSettings.runtimeFlags.hydeEnabled;
    const rankerMode = sanitizedSettings.runtimeFlags.rankerMode;

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

    const question = lastMessage.content;
    const questionHash = hashPayload({ q: question });
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
    const sessionId = telemetrySessionId ?? serverRequestId;
    const userId =
      typeof req.headers["x-user-id"] === "string"
        ? req.headers["x-user-id"]
        : undefined;
    telemetryContext.question = question;
    traceRequestId = serverRequestId;
    telemetryBuffer?.updateContext({
      requestId: traceRequestId,
      sessionId: telemetrySessionId ?? traceRequestId,
    });
    pushTelemetryEvent("quadrant-question", {
      questionLength: question.length,
      guardrailRoute,
    });
    const loggingConfig = await runStage("logging-config", () =>
      getLoggingConfig(),
    );
    const { enabled, sampleRate, detailLevel } = loggingConfig.telemetry;
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
    telemetryBuffer?.updateContext({
      includePii: allowPii,
      question,
    });
    await telemetryBuffer?.ensureTrace();
    traceRequestId =
      traceRequestId ??
      requestIdHeader ??
      sessionId ??
      normalizedQuestion.normalized;
    const trace = traceRequestId ? getRequestTrace(traceRequestId) : null;
    if (process.env.NODE_ENV !== "production") {
      console.debug("[telemetry] langfuse trace", {
        requestId: traceRequestId,
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
    const env = await runStage("env-detect", async () => getAppEnv());
    const cacheMeta: ResponseCacheMeta = {
      responseHit: adminConfig.cache.responseTtlSeconds > 0 ? false : null,
      retrievalHit: adminConfig.cache.retrievalTtlSeconds > 0 ? false : null,
    };
    traceMetadata = mergeTraceMetadata(traceMetadata ?? {}, {
      env,
      requestId: traceRequestId ?? null,
      intent: routingDecision.intent,
      presetId,
      questionHash,
      questionLength: question.length,
      ...(allowPii ? { question } : {}),
      responseCacheStrategy: null,
      responseCacheHit: null,
      aborted: false,
      environment: process.env.NODE_ENV ?? "unknown",
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
      cache: cacheMeta,
    });
    if (shouldCaptureConfig && chatConfigSnapshot) {
      applyTraceMetadataMerge(traceMetadata, {
        chatConfig: chatConfigSnapshot,
        ragConfig: chatConfigSnapshot,
      });
    }
    updateTrace = (updates: TraceUpdate) => {
      if (updates.input) {
        traceInputSummary = mergeSafeTraceInputSummary(
          traceInputSummary,
          updates.input,
        );
      }
      if (updates.output) {
        traceOutputSummary = mergeSafeTraceOutputSummary(
          traceOutputSummary,
          updates.output,
        );
      }
      if (updates.metadata) {
        traceMetadata = mergeTraceMetadata(
          traceMetadata ?? {},
          updates.metadata,
        );
      }
      if (!trace) {
        return;
      }
      void trace.update({
        input: traceInputSummary ?? undefined,
        output: traceOutputSummary ?? undefined,
        metadata: traceMetadata ?? undefined,
      });
    };
    const onTraceAbort = () => {
      finalizeReason = "aborted";
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
        metadata: traceMetadata,
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
      traceId: null,
      langfuseTraceId: null,
    };
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
        const latencyMs = Date.now() - requestStart;
        captureChatCompletion({
          distinctId,
          properties: {
            env,
            trace_id: null,
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
    const autoOrMultiEnabled =
      hydeMode === "auto" ||
      rewriteMode === "auto" ||
      ragMultiQueryMode === "auto";
    let responseCacheKey: string | null = null;
    const responseCacheStrategy: "early" | "late" = autoOrMultiEnabled
      ? "late"
      : "early";
    let cachedSnapshot: {
      output: string;
      citations?: string;
    } | null = null;
    const buildResponseCacheKey = (decision?: RagDecisionSignature | null) =>
      responseCacheTtl > 0
        ? `chat:response:${presetId}:${hashPayload(
            buildResponseCacheKeyPayload({
              presetId,
              intent: routingDecision.intent,
              messages,
              guardrails: {
                ragTopK: guardrails.ragTopK,
                similarityThreshold: guardrails.similarityThreshold,
                ragContextTokenBudget: guardrails.ragContextTokenBudget,
                ragContextClipTokens: guardrails.ragContextClipTokens,
              },
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
              decision,
            }),
          )}`
        : null;
    const handleResponseCacheHit = (
      cacheKey: string,
      snapshot: { output: string; citations?: string },
    ) => {
      mark("cache-response-hit");
      cacheMeta.responseHit = true;
      applyTraceMetadataMerge(traceMetadata, {
        cache: { responseHit: true },
      });
      pushTelemetryEvent("cache-hit", {
        responseCacheKey: cacheKey,
        outputLength: snapshot.output.length,
      });
      const citationsCount = (() => {
        if (!snapshot.citations) {
          return 0;
        }
        try {
          const parsed = JSON.parse(snapshot.citations) as {
            citations?: unknown;
          };
          return Array.isArray(parsed?.citations) ? parsed.citations.length : 0;
        } catch {
          return 0;
        }
      })();
      setSmokeHeaders(res, true);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      const body =
        snapshot.citations !== undefined
          ? `${snapshot.output}${CITATIONS_SEPARATOR}${snapshot.citations}`
          : snapshot.output;
      clearWatchdog();
      res.end(body);
      // ─────────────────────────────────────────────────────────────
      // Telemetry semantic invariant (do not change casually)
      // See: docs/telemetry/telemetry-audit-checklist.md
      // Invariant: cache-hit "insufficient" only inferred when retrieval was attempted and no citations.
      // ─────────────────────────────────────────────────────────────
      const retrievalAttempted = Boolean(
        (traceMetadata as { rag?: { retrieval_attempted?: boolean } })?.rag
          ?.retrieval_attempted ||
        (traceMetadata as { rag?: { retrieval_used?: boolean } })?.rag
          ?.retrieval_used,
      );
      finalizeReason = "success";
      updateTrace?.({
        metadata: {
          responseCacheStrategy,
          responseCacheHit: true,
          aborted: false,
        },
        output: buildSafeTraceOutputSummary({
          answerChars: snapshot.output.length,
          citationsCount,
          cacheHit: true,
          insufficient:
            retrievalAttempted && citationsCount === 0 ? true : null,
          finishReason: "success",
        }),
      });
      capturePosthogEvent?.("success", null);
      logReturn("response-cache-hit");
    };

    updateTrace?.({
      metadata: {
        responseCacheStrategy,
      },
    });

    if (!autoOrMultiEnabled) {
      responseCacheKey = buildResponseCacheKey(null);
      mark("cache-lookup-start");
      if (responseCacheKey) {
        cachedSnapshot = await memoryCacheClient.get(responseCacheKey);
      }
      mark("cache-lookup-done");
      mark("cache-lookup", {
        responseCacheKey,
        cacheHit: Boolean(cachedSnapshot),
      });
      if (cachedSnapshot && responseCacheKey) {
        handleResponseCacheHit(responseCacheKey, cachedSnapshot);
        return;
      }
      mark("cache-miss");
      updateTrace?.({
        metadata: {
          responseCacheStrategy,
          responseCacheHit: false,
        },
      });
      applyTraceMetadataMerge(traceMetadata, {
        cache: { responseHit: cacheMeta.responseHit },
      });
    }
    if (includeVerboseDetails) {
      ragLogger.debug("[langchain_chat] response cache strategy", {
        responseCacheStrategy,
      });
    }

    const [{ createClient }, { PromptTemplate }] = await Promise.all([
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

    mark("supabase-client-start");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    mark("supabase-client-done");
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
        guardrails,
        normalizedQuestion,
        routingDecision,
        reverseRagEnabled,
        reverseRagMode,
        hydeEnabled,
        hydeMode,
        rewriteMode,
        ragMultiQueryMode,
        ragMultiQueryMaxQueries,
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
        includeSelectionTelemetry,
        trace,
        env,
        memoryCacheClient,
        retrievalCacheTtl,
        presetId,
        cacheMeta,
        traceMetadata: traceMetadata ?? undefined,
        historyWindow,
        ragRanking,
        abortSignal: requestAbortSignal,
        chainRunContext,
        markStage: mark,
        updateTrace: updateTrace ?? undefined,
      });
      mark("after-rag-context");

      _analyticsTotalTokens = ragResult.contextResult.totalTokens ?? null;
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

      if (autoOrMultiEnabled && responseCacheTtl > 0) {
        const decision = ragResult.decisionSignature ?? null;
        responseCacheKey = buildResponseCacheKey(decision);
        mark("cache-lookup-start");
        if (responseCacheKey) {
          cachedSnapshot = await memoryCacheClient.get(responseCacheKey);
        }
        mark("cache-lookup-done");
        mark("cache-lookup", {
          responseCacheKey,
          cacheHit: Boolean(cachedSnapshot),
        });
        if (includeVerboseDetails) {
          ragLogger.debug("[langchain_chat] response cache strategy", {
            responseCacheStrategy,
            decision: decision
              ? {
                  autoTriggered: decision.autoTriggered,
                  winner: decision.winner,
                  altType: decision.altType,
                  multiQueryRan: decision.multiQueryRan,
                }
              : null,
            altQueryHashPresent: Boolean(decision?.altQueryHash),
          });
        }
        if (cachedSnapshot && responseCacheKey) {
          handleResponseCacheHit(responseCacheKey, cachedSnapshot);
          return false;
        }
        mark("cache-miss");
        updateTrace?.({
          metadata: {
            responseCacheStrategy,
            responseCacheHit: false,
          },
        });
        applyTraceMetadataMerge(traceMetadata, {
          cache: { responseHit: cacheMeta.responseHit },
        });
      }

      mark("before-streaming");
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
        provider,
        model: llmModel,
        requestedModelId: llmModel,
        candidateModelId,
        responseCacheKey,
        responseCacheTtl,
        cacheMeta,
        traceMetadata: traceMetadata ?? undefined,
        res,
        abortSignal: requestAbortSignal,
        capturePosthogEvent,
        respondJson,
        clearWatchdog,
        markStage: (stage, extra) => mark(stage, extra),
        chainRunContext,
        logReturn,
        initialStreamStarted: earlyStreamStarted,
        trace,
        updateTrace: updateTrace ?? undefined,
      });
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
      stage: lastStage,
      message: err instanceof Error ? err.message : String(err),
    });
    const errorType =
      err instanceof OllamaUnavailableError
        ? "local_llm_unavailable"
        : classifyChatCompletionError(err);
    errorCategory = errorType;
    finalizeReason = "error";
    updateTrace?.({
      output: buildSafeTraceOutputSummary({
        answerChars: 0,
        citationsCount: null,
        cacheHit: traceMetadata?.cache?.responseHit ?? null,
        insufficient: null,
        finishReason: "error",
        errorCategory,
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
    // ─────────────────────────────────────────────────────────────
    // Telemetry semantic invariant (do not change casually)
    // See: docs/telemetry/telemetry-audit-checklist.md
    // Invariant: finalize ensures trace input/output summaries exist on all exits.
    // ─────────────────────────────────────────────────────────────
  } finally {
    if (updateTrace) {
      const fallbackInput = buildSafeTraceInputSummary({
        intent:
          typeof traceMetadata?.intent === "string"
            ? traceMetadata.intent
            : null,
        model:
          typeof traceMetadata?.model === "string" ? traceMetadata.model : null,
        topK:
          typeof (traceMetadata as { chatConfig?: { rag?: { topK?: number } } })
            ?.chatConfig?.rag?.topK === "number"
            ? ((traceMetadata as { chatConfig?: { rag?: { topK?: number } } })
                ?.chatConfig?.rag?.topK ?? null)
            : null,
        historyWindowTokens: null,
        questionLength:
          typeof (traceMetadata as { questionLength?: number })
            ?.questionLength === "number"
            ? (traceMetadata as { questionLength?: number }).questionLength
            : null,
        settingsHash:
          typeof (
            traceMetadata as {
              chatConfig?: { prompt?: { baseVersion?: string } };
            }
          )?.chatConfig?.prompt?.baseVersion === "string"
            ? ((
                traceMetadata as {
                  chatConfig?: { prompt?: { baseVersion?: string } };
                }
              )?.chatConfig?.prompt?.baseVersion ?? null)
            : null,
      });
      updateTrace({ input: fallbackInput });
      if (!traceOutputSummary) {
        const finishReason =
          finalizeReason ?? (requestAbortSignal?.aborted ? "aborted" : "error");
        updateTrace({
          output: buildSafeTraceOutputSummary({
            answerChars: 0,
            citationsCount: null,
            cacheHit: traceMetadata?.cache?.responseHit ?? null,
            insufficient: null,
            finishReason,
            errorCategory:
              finishReason === "error" ? (errorCategory ?? "unknown") : null,
          }),
          metadata: {
            aborted: finishReason === "aborted",
          },
        });
      }
    }
    cleanupRequestAbort?.();
    clearWatchdog();
    if (traceRequestId) {
      clearRequestTrace(traceRequestId);
    }
    if (!res.headersSent && !res.writableEnded) {
      respondJson(500, {
        error: "LangChain handler did not produce a response",
      });
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
  maxTokens: number,
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
        maxTokens,
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
        maxOutputTokens: maxTokens,
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
        maxTokens,
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
