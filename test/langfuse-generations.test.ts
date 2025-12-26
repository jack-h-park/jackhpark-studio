import { describe, it } from "node:test";

import { emitAnswerGeneration } from "@/lib/server/telemetry/langfuse-generations";

void describe("emitAnswerGeneration", () => {
  void it("skips generation when trace is missing", async () => {
    await emitAnswerGeneration({
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
