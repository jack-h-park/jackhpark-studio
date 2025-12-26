import { randomUUID } from "node:crypto";

import { langfuse, type LangfuseTrace } from "@/lib/langfuse";
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

export type EmitAnswerGenerationOptions = {
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

const buildAnswerGenerationInput = (
  options: EmitAnswerGenerationOptions,
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

const buildGenerationOutput = (
  options: EmitAnswerGenerationOptions,
): Record<string, unknown> => ({
  finish_reason: options.finishReason,
  aborted: options.aborted,
  error_category: options.errorCategory ?? null,
  cache_hit: options.cacheHit,
  answer_chars: options.answerChars,
  citationsCount: options.citationsCount,
  insufficient: options.insufficient,
});

export async function emitAnswerGeneration(
  options: EmitAnswerGenerationOptions,
): Promise<void> {
  const { trace } = options;
  if (!trace) {
    return;
  }
  const client = langfuse.client;
  if (!client) {
    return;
  }

  const traceId = trace.traceId;
  if (!traceId) {
    return;
  }

  const startTime = new Date(options.startTimeMs).toISOString();
  const endTime = new Date(options.endTimeMs).toISOString();

  const ingestionEvent = {
    type: "generation-create" as const,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    body: {
      id: randomUUID(),
      traceId,
      name: "answer:llm",
      startTime,
      endTime,
      environment: trace.environment,
      model: options.model,
      metadata: {
        requestId: options.requestId ?? null,
      },
      input: buildAnswerGenerationInput(options),
      output: buildGenerationOutput(options),
    },
  };

  try {
    await client.api.ingestion.batch({ batch: [ingestionEvent] });
  } catch (err) {
    telemetryLogger.debug("langfuse generation emission failed", {
      requestId: options.requestId ?? null,
      error: err instanceof Error ? err.message : err,
    });
  }
}
