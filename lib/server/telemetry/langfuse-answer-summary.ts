import { type LangfuseTrace } from "@/lib/langfuse";
import { telemetryLogger } from "@/lib/logging/logger";
import { type ChatGuardrailConfig } from "@/lib/server/chat-guardrails";
import { buildGenerationInput as buildLangfuseGenerationInput } from "@/lib/server/telemetry/langfuse-metadata";
import { type TelemetryConfigSummary } from "@/lib/server/telemetry/telemetry-config-snapshot";

type RagConfigSummary = {
  ragTopK: number;
  similarityThreshold: number;
  rankerMode: string;
  reverseRagEnabled: boolean;
  hydeEnabled: boolean;
};

export type EmitAnswerSummarySpanOptions = {
  trace: LangfuseTrace | null;
  requestId?: string | null;
  intent: string;
  presetId: string;
  provider: string;
  model: string;
  guardrails?: ChatGuardrailConfig | null;
  configSummary?: TelemetryConfigSummary | null;
  questionHash: string | null;
  questionLength: number;
  question?: string;
  /** Final answer text; only emitted when allowPii is true (mirrors question). */
  answer?: string;
  allowPii?: boolean;
  detailLevel: string;
  configHash?: string | null;
  ragConfig?: RagConfigSummary | null;
  finishReason: string;
  aborted: boolean;
  errorCategory?: string | null;
  cacheHit: boolean | null;
  answerChars: number;
  citationsCount: number | null;
  insufficient: boolean | null;
  startTimeMs: number;
  endTimeMs: number;
};

const buildAnswerSummaryInput = (
  options: EmitAnswerSummarySpanOptions,
): Record<string, unknown> => {
  const sanitizedInput = buildLangfuseGenerationInput({
    intent: options.intent,
    resolvedModel: options.model,
    provider: options.provider,
    presetId: options.presetId,
    detailLevel: options.detailLevel,
    guardrails: options.guardrails ?? null,
    configHash: options.configHash ?? null,
    configSummary: options.configSummary ?? null,
  });
  const { detailLevel: _sanitizedDetailLevel, ...sanitizedFields } =
    sanitizedInput;
  const input: Record<string, unknown> = {
    ...sanitizedFields,
    requestId: options.requestId ?? null,
    questionHash: options.questionHash,
    questionLength: options.questionLength,
    telemetry: {
      detailLevel: options.detailLevel ?? null,
    },
  };

  if (options.configHash) {
    input.configHash = options.configHash;
  }

  if (options.allowPii && options.question) {
    input.question = options.question;
  }

  if (options.ragConfig) {
    input.ragConfig = {
      ragTopK: options.ragConfig.ragTopK,
      similarityThreshold: options.ragConfig.similarityThreshold,
      rankerMode: options.ragConfig.rankerMode,
      reverseRagEnabled: options.ragConfig.reverseRagEnabled,
      hydeEnabled: options.ragConfig.hydeEnabled,
    };
  }

  return input;
};

const buildAnswerSummaryOutput = (
  options: EmitAnswerSummarySpanOptions,
): Record<string, unknown> => {
  const output: Record<string, unknown> = {
    finish_reason: options.finishReason,
    aborted: options.aborted,
    error_category: options.errorCategory ?? null,
    cache_hit: options.cacheHit,
    answer_chars: options.answerChars,
    citationsCount: options.citationsCount,
    insufficient: options.insufficient,
  };
  // Same PII gate as the question on the input side: full answer text is only
  // stored when LANGFUSE_INCLUDE_PII allows it.
  if (options.allowPii && options.answer) {
    output.answer = options.answer;
  }
  return output;
};

/**
 * Emits the `answer:summary` observation: a PII-safe summary of the answer stage
 * (config snapshot in, finish semantics out) timed over the LLM generation.
 *
 * This is a SPAN, not a GENERATION, on purpose. Token usage and cost for the
 * answer call are owned solely by the LangChain CallbackHandler's generation,
 * which reports the provider's real usage. This observation never carries
 * `model`: a GENERATION without usage makes Langfuse infer tokens by tokenizing
 * input/output, which here are JSON summaries — that produced fabricated token
 * counts and double-counted cost against the real generation.
 *
 * Named `answer:summary`, not `answer:llm`. The LangChain answer chain already
 * emits an `answer:llm` runnable that parents the real generation. Today the two
 * only avoid colliding because they land in different traces; once Phase 5 puts
 * them in one tree, one name would shadow the other and a consumer deduplicating
 * by name would drop whichever it saw second — silently losing either the real
 * cost or the finish semantics the digest reads.
 *
 * Emitted through `trace.observation()` rather than the ingestion API directly,
 * so it follows whichever backend `LANGFUSE_OTEL_TRACING` selects instead of
 * pinning itself to legacy transport.
 */
export async function emitAnswerSummarySpan(
  options: EmitAnswerSummarySpanOptions,
): Promise<void> {
  const { trace } = options;
  if (!trace) {
    return;
  }

  try {
    await trace.observation({
      name: "answer:summary",
      startTime: new Date(options.startTimeMs).toISOString(),
      endTime: new Date(options.endTimeMs).toISOString(),
      metadata: {
        requestId: options.requestId ?? null,
        provider: options.provider,
        model: options.model,
      },
      input: buildAnswerSummaryInput(options),
      output: buildAnswerSummaryOutput(options),
    });
  } catch (err) {
    telemetryLogger.debug("langfuse answer summary span emission failed", {
      requestId: options.requestId ?? null,
      error: err instanceof Error ? err.message : err,
    });
  }
}
