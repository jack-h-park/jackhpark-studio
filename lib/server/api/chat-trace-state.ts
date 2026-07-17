import type {
  ChatGuardrailConfig,
  RoutedQuestion,
} from "@/lib/server/chat-guardrails";
import type { ChainRunContext } from "@/lib/server/langchain/runnable-config";
import type { buildTelemetryConfigSnapshot } from "@/lib/server/telemetry/telemetry-config-snapshot";
import { createObservation, type LangfuseTrace } from "@/lib/langfuse";
import { emitAnswerSummarySpan } from "@/lib/server/telemetry/langfuse-answer-summary";
import {
  buildSafeTraceInputSummary,
  buildSafeTraceOutputSummary,
  mergeSafeTraceInputSummary,
  mergeSafeTraceOutputSummary,
  type SafeTraceInputSummary,
  type SafeTraceOutputSummary,
} from "@/lib/server/telemetry/telemetry-summaries";
import {
  mergeTraceMetadata,
  type TraceMetadataSnapshot,
  type TraceUpdate,
} from "@/lib/server/telemetry/trace-metadata-merge";

/**
 * Mutable per-request trace/analytics state for the chat handler. Groups the
 * values that used to live in ~30 separate handler-scope variables so that
 * trace finalization (and PostHog capture) can read one coherent snapshot.
 */
export type ChatTraceState = {
  trace: LangfuseTrace | null;
  requestId: string | null;
  metadata: TraceMetadataSnapshot | null;
  inputSummary: SafeTraceInputSummary | null;
  outputSummary: SafeTraceOutputSummary | null;
  finalizeReason: SafeTraceOutputSummary["finish_reason"] | null;
  errorCategory: string | null;
  llmGenerationStartMs: number | null;
  llmGenerationEndMs: number | null;
  answerSummarySpanEmitted: boolean;
  chainRunContext: ChainRunContext | null;
  detailLevel: string | null;
  provider: string | null;
  llmModel: string | null;
  allowPii: boolean | null;
  telemetryConfigSnapshot:
    | ReturnType<typeof buildTelemetryConfigSnapshot>
    | undefined;
  rankerMode: string | null;
  reverseRagEnabled: boolean | null;
  hydeEnabled: boolean | null;
  routingDecision: RoutedQuestion | null;
  guardrails: ChatGuardrailConfig | null;
  presetId: string | null;
  question: string | null;
  questionHash: string | null;
  /** Final answer text; populated only when PII capture is allowed. */
  answerText: string | null;
  retrievalAttempted: boolean | null;
  retrievalUsed: boolean | null;
  retrievalLatencyMs: number | null;
  analyticsTotalTokens: number | null;
};

export function createChatTraceState(): ChatTraceState {
  return {
    trace: null,
    requestId: null,
    metadata: null,
    inputSummary: null,
    outputSummary: null,
    finalizeReason: null,
    errorCategory: null,
    llmGenerationStartMs: null,
    llmGenerationEndMs: null,
    answerSummarySpanEmitted: false,
    chainRunContext: null,
    detailLevel: null,
    provider: null,
    llmModel: null,
    allowPii: null,
    telemetryConfigSnapshot: undefined,
    rankerMode: null,
    reverseRagEnabled: null,
    hydeEnabled: null,
    routingDecision: null,
    guardrails: null,
    presetId: null,
    question: null,
    questionHash: null,
    answerText: null,
    retrievalAttempted: null,
    retrievalUsed: null,
    retrievalLatencyMs: null,
    analyticsTotalTokens: null,
  };
}

/**
 * Returns the updateTrace function: merges updates into the state summaries
 * and pushes the merged view to Langfuse when a trace is attached.
 */
export function createTraceUpdater(
  state: ChatTraceState,
): (updates: TraceUpdate) => void {
  return (updates: TraceUpdate) => {
    if (updates.input) {
      state.inputSummary = mergeSafeTraceInputSummary(
        state.inputSummary,
        updates.input,
      );
    }
    if (updates.output) {
      state.outputSummary = mergeSafeTraceOutputSummary(
        state.outputSummary,
        updates.output,
      );
    }
    if (updates.metadata) {
      state.metadata = mergeTraceMetadata(state.metadata ?? {}, updates.metadata);
    }
    if (!state.trace) {
      return;
    }
    void state.trace.update({
      input: state.inputSummary ?? undefined,
      output: state.outputSummary ?? undefined,
      metadata: state.metadata ?? undefined,
    });
  };
}

// ─────────────────────────────────────────────────────────────
// Telemetry semantic invariant (do not change casually)
// See: docs/telemetry/operations/telemetry-operational-verification-local.md
// Invariant: finalize ensures trace input/output summaries exist on all exits.
// ─────────────────────────────────────────────────────────────
export function finalizeChatTrace(
  state: ChatTraceState,
  updateTrace: (updates: TraceUpdate) => void,
  { requestAborted }: { requestAborted: boolean },
): void {
  const metadata = state.metadata;
  const fallbackInput = buildSafeTraceInputSummary({
    intent: typeof metadata?.intent === "string" ? metadata.intent : null,
    model: typeof metadata?.model === "string" ? metadata.model : null,
    topK:
      typeof (metadata as { chatConfig?: { rag?: { topK?: number } } })
        ?.chatConfig?.rag?.topK === "number"
        ? ((metadata as { chatConfig?: { rag?: { topK?: number } } })
            ?.chatConfig?.rag?.topK ?? null)
        : null,
    historyWindowTokens: null,
    questionLength:
      typeof (metadata as { questionLength?: number })?.questionLength ===
      "number"
        ? (metadata as { questionLength?: number }).questionLength
        : null,
    settingsHash:
      typeof (
        metadata as {
          chatConfig?: { prompt?: { baseVersion?: string } };
        }
      )?.chatConfig?.prompt?.baseVersion === "string"
        ? ((
            metadata as {
              chatConfig?: { prompt?: { baseVersion?: string } };
            }
          )?.chatConfig?.prompt?.baseVersion ?? null)
        : null,
  });
  updateTrace({ input: fallbackInput });
  if (!state.outputSummary) {
    const finishReason =
      state.finalizeReason ?? (requestAborted ? "aborted" : "error");
    updateTrace({
      output: buildSafeTraceOutputSummary({
        answerChars: 0,
        citationsCount: null,
        cacheHit: state.metadata?.cache?.responseHit ?? null,
        insufficient: null,
        finishReason,
        errorCategory:
          finishReason === "error" ? (state.errorCategory ?? "unknown") : null,
      }),
      metadata: {
        aborted: finishReason === "aborted",
      },
    });
  }

  // At-a-glance failure marker: Langfuse surfaces the highest observation
  // level on the trace list, so failed/aborted requests get a red/yellow badge
  // instead of looking identical to successful ones until the tree is opened.
  const finalReason = state.outputSummary?.finish_reason;
  if (state.trace && (finalReason === "error" || finalReason === "aborted")) {
    void createObservation(state.trace, {
      name: finalReason === "error" ? "request:error" : "request:aborted",
      level: finalReason === "error" ? "ERROR" : "WARNING",
      statusMessage:
        finalReason === "error"
          ? (state.errorCategory ??
            state.outputSummary?.error_category ??
            "unknown error")
          : "client aborted the request",
    });
  }

  if (
    state.trace &&
    !state.answerSummarySpanEmitted &&
    state.llmGenerationStartMs !== null &&
    state.outputSummary &&
    state.routingDecision &&
    state.guardrails
  ) {
    state.answerSummarySpanEmitted = true;
    const outputSummary = state.outputSummary;
    const ragConfig =
      state.routingDecision.intent === "knowledge"
        ? {
            ragTopK: state.guardrails.ragTopK,
            similarityThreshold: state.guardrails.similarityThreshold,
            rankerMode: state.rankerMode ?? "none",
            reverseRagEnabled: state.reverseRagEnabled ?? false,
            hydeEnabled: state.hydeEnabled ?? false,
          }
        : null;
    void emitAnswerSummarySpan({
      trace: state.trace,
      requestId: state.requestId ?? state.chainRunContext?.requestId ?? null,
      intent: state.routingDecision.intent,
      detailLevel: state.detailLevel ?? "standard",
      presetId: state.presetId ?? "unknown",
      provider: state.provider ?? "unknown",
      model: state.llmModel ?? "unknown",
      guardrails: state.guardrails ?? null,
      configSummary: state.telemetryConfigSnapshot?.configSummary ?? null,
      questionHash: state.questionHash ?? null,
      questionLength: state.question?.length ?? 0,
      question: state.question ?? undefined,
      answer: state.answerText ?? undefined,
      allowPii: state.allowPii ?? false,
      configHash: state.telemetryConfigSnapshot?.configHash ?? null,
      ragConfig,
      finishReason: outputSummary.finish_reason,
      aborted: Boolean(state.metadata?.aborted),
      errorCategory: outputSummary.error_category ?? null,
      cacheHit: outputSummary.cache_hit,
      answerChars: outputSummary.answer_chars,
      citationsCount: outputSummary.citationsCount,
      insufficient: outputSummary.insufficient,
      startTimeMs: state.llmGenerationStartMs,
      endTimeMs: state.llmGenerationEndMs ?? state.llmGenerationStartMs,
    });
  }
}
