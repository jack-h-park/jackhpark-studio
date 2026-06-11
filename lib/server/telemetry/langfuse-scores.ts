import {
  ensureLangfuseClient,
  langfuse,
  type LangfuseTrace,
} from "@/lib/langfuse";
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

export const USER_FEEDBACK_SCORE_NAME = "user_feedback" as const;

export type UserFeedbackValue = "up" | "down";

export type EmitUserFeedbackScoreOptions = {
  traceId: string;
  value: UserFeedbackValue;
  comment?: string | null;
  /** Low-cardinality context for filtering in the Scores view (no PII). */
  metadata?: Record<string, unknown> | null;
};

/**
 * Emits a binary `user_feedback` Langfuse score (👍=1 / 👎=0) against an
 * existing trace. Unlike {@link emitRagScores}, this runs from a separate
 * request (the feedback API route) after the original trace has closed, so it
 * ensures the client and flushes the score before returning. Resolves to
 * `true` on success, `false` when telemetry is unavailable or emission fails.
 */
export async function emitUserFeedbackScore(
  options: EmitUserFeedbackScoreOptions,
): Promise<boolean> {
  const { traceId, value, comment, metadata } = options;
  if (!traceId) {
    return false;
  }

  const client = await ensureLangfuseClient();
  if (!client) {
    return false;
  }

  try {
    client.score.create({
      traceId,
      name: USER_FEEDBACK_SCORE_NAME,
      value: value === "up" ? 1 : 0,
      dataType: "BOOLEAN",
      comment: comment?.trim() ? comment.trim() : undefined,
      metadata: metadata ?? undefined,
    });
    await client.score.flush();
    return true;
  } catch (err) {
    logScoreError(traceId, USER_FEEDBACK_SCORE_NAME, err);
    return false;
  }
}
