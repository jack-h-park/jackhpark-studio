import { describe, it } from "node:test";

import { emitAnswerSummarySpan } from "@/lib/server/telemetry/langfuse-answer-summary";

void describe("emitAnswerSummarySpan", () => {
  void it("skips emission when trace is missing", async () => {
    await emitAnswerSummarySpan({
      trace: null,
      requestId: "request",
      intent: "knowledge",
      presetId: "preset",
      provider: "provider",
      model: "model",
      questionHash: "hash",
      questionLength: 5,
      question: "test",
      allowPii: false,
      detailLevel: "standard",
      finishReason: "success",
      aborted: false,
      cacheHit: false,
      answerChars: 10,
      citationsCount: 0,
      insufficient: false,
      startTimeMs: Date.now(),
      endTimeMs: Date.now(),
    });
  });
});
