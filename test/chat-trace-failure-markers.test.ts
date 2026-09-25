import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  LangfuseObservationOptions,
  LangfuseTrace,
  LangfuseTraceOptions,
} from "@/lib/langfuse";
import {
  type ChatTraceState,
  createChatTraceState,
  createTraceUpdater,
  finalizeChatTrace,
} from "@/lib/server/api/chat-trace-state";
import { buildSafeTraceOutputSummary } from "@/lib/server/telemetry/telemetry-summaries";

type TraceSpy = {
  trace: LangfuseTrace;
  observations: LangfuseObservationOptions[];
  updates: Partial<LangfuseTraceOptions>[];
};

function createTraceSpy(): TraceSpy {
  const observations: LangfuseObservationOptions[] = [];
  const updates: Partial<LangfuseTraceOptions>[] = [];
  const trace: LangfuseTrace = {
    traceId: "trace-1",
    id: "trace-1",
    environment: "test",
    observation: async (options) => {
      observations.push(options);
    },
    update: async (options) => {
      updates.push(options);
    },
    end: () => {},
  };
  return { trace, observations, updates };
}

/**
 * Mirrors the production wiring: the handler passes the updater built from the
 * same state object, so finalize's own fallback write is what populates
 * state.outputSummary on exits that never produced one.
 */
function finalizeWith(
  mutate: (state: ChatTraceState) => void,
  { requestAborted }: { requestAborted: boolean },
): { state: ChatTraceState; spy: TraceSpy } {
  const spy = createTraceSpy();
  const state = createChatTraceState();
  state.trace = spy.trace;
  mutate(state);
  finalizeChatTrace(state, createTraceUpdater(state), { requestAborted });
  return { state, spy };
}

void describe("finalizeChatTrace failure markers", () => {
  void it("emits request:aborted when outputSummary starts null and the request aborted", () => {
    const { state, spy } = finalizeWith(() => {}, { requestAborted: true });

    assert.equal(state.outputSummary?.finish_reason, "aborted");
    const marker = spy.observations.find((o) => o.name === "request:aborted");
    assert.ok(marker, "expected a request:aborted observation");
    assert.equal(marker.level, "WARNING");
    assert.equal(marker.statusMessage, "client aborted the request");
    assert.equal(state.metadata?.aborted, true);
  });

  void it("emits request:aborted when an earlier path already recorded the abort", () => {
    const { state, spy } = finalizeWith(
      (s) => {
        s.finalizeReason = "aborted";
        s.outputSummary = buildSafeTraceOutputSummary({
          answerChars: 0,
          citationsCount: null,
          cacheHit: null,
          insufficient: null,
          finishReason: "aborted",
        });
      },
      { requestAborted: true },
    );

    assert.equal(state.outputSummary?.finish_reason, "aborted");
    assert.equal(
      spy.observations.filter((o) => o.name === "request:aborted").length,
      1,
    );
  });

  void it("emits request:error with the recorded error category when no summary exists", () => {
    const { state, spy } = finalizeWith(
      (s) => {
        s.errorCategory = "provider_timeout";
      },
      { requestAborted: false },
    );

    assert.equal(state.outputSummary?.finish_reason, "error");
    const marker = spy.observations.find((o) => o.name === "request:error");
    assert.ok(marker, "expected a request:error observation");
    assert.equal(marker.level, "ERROR");
    assert.equal(marker.statusMessage, "provider_timeout");
    assert.equal(state.metadata?.aborted, false);
  });

  void it("emits no marker on a successful exit", () => {
    const { spy } = finalizeWith(
      (s) => {
        s.outputSummary = buildSafeTraceOutputSummary({
          answerChars: 120,
          citationsCount: 3,
          cacheHit: false,
          insufficient: false,
          finishReason: "success",
        });
      },
      { requestAborted: false },
    );

    assert.equal(
      spy.observations.filter((o) => o.name.startsWith("request:")).length,
      0,
    );
  });
});
