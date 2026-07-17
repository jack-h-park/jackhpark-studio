import { createHash } from "node:crypto";

import type { NextApiRequest, NextApiResponse } from "next";

import { telemetryLogger } from "@/lib/logging/logger";
import {
  emitUserFeedbackScore,
  type UserFeedbackValue,
} from "@/lib/server/telemetry/langfuse-scores";

// Cap free-text comments to keep payloads small and limit accidental PII.
const MAX_COMMENT_LENGTH = 1000;

type FeedbackRequestBody = {
  traceId?: unknown;
  value?: unknown;
  comment?: unknown;
  messageId?: unknown;
  sessionId?: unknown;
};

function isFeedbackValue(value: unknown): value is UserFeedbackValue {
  return value === "up" || value === "down";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const body = (req.body ?? {}) as FeedbackRequestBody;
  const traceId = typeof body.traceId === "string" ? body.traceId.trim() : "";
  if (!traceId) {
    return res.status(400).json({ error: "traceId is required" });
  }
  if (!isFeedbackValue(body.value)) {
    return res.status(400).json({ error: "value must be 'up' or 'down'" });
  }

  const comment =
    typeof body.comment === "string"
      ? body.comment.slice(0, MAX_COMMENT_LENGTH)
      : null;
  const messageId =
    typeof body.messageId === "string" ? body.messageId : undefined;
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId : undefined;

  // Deterministic per-answer score id (UUID-shaped for ingestion): a repeat
  // POST for the same message — e.g. a 👎 followed by an optional comment —
  // upserts the one score instead of double-counting in the weekly digest.
  const scoreId = createHash("sha256")
    .update(`user_feedback:${traceId}:${messageId ?? "message"}`)
    .digest("hex")
    .replace(
      /^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/,
      "$1-$2-$3-$4-$5",
    );

  try {
    const emitted = await emitUserFeedbackScore({
      traceId,
      value: body.value,
      comment,
      scoreId,
      metadata: { source: "chat-ui", messageId, sessionId },
    });
    // 202 when telemetry is disabled/unavailable so the UI can still confirm
    // the click was received without implying a stored score.
    return res.status(emitted ? 200 : 202).json({ ok: emitted });
  } catch (err) {
    telemetryLogger.debug("[api/chat-feedback] failed to emit feedback", {
      traceId,
      error: err instanceof Error ? err.message : String(err ?? "unknown"),
    });
    return res.status(500).json({ error: "Failed to record feedback" });
  }
}
