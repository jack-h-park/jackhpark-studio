import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LangfuseTrace } from "@/lib/langfuse";
import { emitRagScores } from "@/lib/server/telemetry/langfuse-scores";

type StubScoreClient = {
  calls: Array<{ traceId: string; name: string; value: number }>;
  create(data: { traceId: string; name: string; value: number }): void;
};

function makeTrace(): LangfuseTrace {
  return {
    traceId: "trace-id",
    id: "trace-id",
    environment: "dev",
    observation: async () => {
      // no-op
    },
    update: async () => {
      // no-op
    },
  };
}

function makeScoreClient(): StubScoreClient {
  const calls: StubScoreClient["calls"] = [];
  return {
    calls,
    create(data) {
      calls.push(data);
    },
  };
}

void describe("emitRagScores", () => {
  void it("does not emit when trace is missing", () => {
    const client = makeScoreClient();
    emitRagScores({
      trace: null,
      intent: "knowledge",
      highestScore: 0.6,
      scoreClient: client,
    });
    assert.equal(client.calls.length, 0);
  });

  void it("does not emit when intent is not knowledge", () => {
    const trace = makeTrace();
    const client = makeScoreClient();
    emitRagScores({
      trace,
      intent: "chitchat",
      highestScore: 0.5,
      scoreClient: client,
    });
    assert.equal(client.calls.length, 0);
  });

  void it("skips the score when highestScore is not finite", () => {
    const trace = makeTrace();
    const client = makeScoreClient();
    emitRagScores({
      trace,
      intent: "knowledge",
      highestScore: Number.NaN,
      scoreClient: client,
    });
    assert.equal(client.calls.length, 0);
  });

  void it("emits retrieval_highest_score for valid knowledge intent", () => {
    const trace = makeTrace();
    const client = makeScoreClient();
    emitRagScores({
      trace,
      intent: "knowledge",
      requestId: "req-123",
      highestScore: 0.723,
      insufficient: true,
      uniqueDocs: 4,
      scoreClient: client,
    });
    assert.equal(client.calls.length, 3);
    assert.deepEqual(client.calls[0], {
      traceId: trace.traceId,
      name: "retrieval_highest_score",
      value: 0.723,
    });
    assert.deepEqual(client.calls[1], {
      traceId: trace.traceId,
      name: "retrieval_insufficient",
      value: 1,
    });
    assert.deepEqual(client.calls[2], {
      traceId: trace.traceId,
      name: "context_unique_docs",
      value: 4,
    });
  });
});
