import { langfuse,type LangfuseTrace  } from "@/lib/langfuse";
import { telemetryLogger } from "@/lib/logging/logger";

type ScoreEmitter = {
  create(data: { traceId: string; name: string; value: number }): void;
};

export type EmitRagScoresOptions = {
  trace: LangfuseTrace | null;
  intent: string;
  requestId?: string | null;
  highestScore?: number;
  insufficient?: boolean | null;
  uniqueDocs?: number | null;
  scoreClient?: ScoreEmitter | null;
};

const SCORE_NAMES = {
  highestScore: "retrieval_highest_score",
  insufficient: "retrieval_insufficient",
  uniqueDocs: "context_unique_docs",
} as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function logScoreError(
  requestId: string | null | undefined,
  scoreName: string,
  error: unknown,
) {
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown";
  telemetryLogger.debug("langfuse score emission failed", {
    requestId: requestId ?? null,
    scoreName,
    errorMessage,
  });
}

function emitScore(
  scoreClient: ScoreEmitter,
  traceId: string,
  scoreName: string,
  value: number,
  requestId?: string | null,
) {
  try {
    scoreClient.create({ traceId, name: scoreName, value });
  } catch (err) {
    logScoreError(requestId ?? null, scoreName, err);
  }
}

export function emitRagScores(options: EmitRagScoresOptions): void {
  const {
    trace,
    intent,
    requestId,
    highestScore,
    insufficient,
    uniqueDocs,
    scoreClient,
  } = options;

  if (!trace || intent !== "knowledge") {
    return;
  }

  const traceId = trace.traceId;
  if (!traceId) {
    return;
  }

  const client = scoreClient ?? langfuse.client?.score;
  if (!client) {
    return;
  }

  if (isFiniteNumber(highestScore)) {
    emitScore(
      client,
      traceId,
      SCORE_NAMES.highestScore,
      highestScore,
      requestId,
    );
  }

  if (typeof insufficient === "boolean") {
    emitScore(
      client,
      traceId,
      SCORE_NAMES.insufficient,
      insufficient ? 1 : 0,
      requestId,
    );
  }

  if (isFiniteNumber(uniqueDocs)) {
    emitScore(client, traceId, SCORE_NAMES.uniqueDocs, uniqueDocs, requestId);
  }
}
