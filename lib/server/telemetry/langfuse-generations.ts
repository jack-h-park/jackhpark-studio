import { randomUUID } from "node:crypto";

import { langfuse,type LangfuseTrace  } from "@/lib/langfuse";
import { telemetryLogger } from "@/lib/logging/logger";

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

const buildGenerationInput = (
  options: EmitAnswerGenerationOptions,
): Record<string, unknown> => {
  const input: Record<string, unknown> = {
    requestId: options.requestId ?? null,
    intent: options.intent,
    presetId: options.presetId,
    provider: options.provider,
    model: options.model,
    questionHash: options.questionHash,
    questionLength: options.questionLength,
    detailLevel: options.detailLevel,
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
      input: buildGenerationInput(options),
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
