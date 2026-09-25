// Pins the failure-marker contract in finalizeChatTrace.
//
// These markers are how a failed or aborted request is distinguishable in the
// Langfuse trace list without opening the tree, and they were the last thing
// still writing to the legacy ingestion endpoint after the OTel switch. They
// now go through trace.observation(), and that transport cannot be exercised
// end-to-end: a client disconnect is not propagated to the function on Vercel,
// so the abort path is unreachable from an HTTP probe against production.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LangfuseObservationOptions, LangfuseTrace } from "@/lib/langfuse";
import {
  createChatTraceState,
  createTraceUpdater,
  finalizeChatTrace,
} from "@/lib/server/api/chat-trace-state";
import { buildSafeTraceOutputSummary } from "@/lib/server/telemetry/telemetry-summaries";

function createTraceSpy(): {
  trace: LangfuseTrace;
  observations: LangfuseObservationOptions[];
} {
  const observations: LangfuseObservationOptions[] = [];
  return {
    observations,
    trace: {
      traceId: "trace-id",
      id: "trace-id",
      environment: "dev",
      observation: async (options) => {
        observations.push(options);
      },
      update: async () => {
        // no-op
      },
      end: () => {
        // no-op
      },
    },
  };
}

function finalizeWith(
  finishReason: "success" | "aborted" | "error",
  errorCategory: string | null = null,
) {
  const { trace, observations } = createTraceSpy();
  const state = createChatTraceState();
  state.trace = trace;
  state.errorCategory = errorCategory;
  state.outputSummary = buildSafeTraceOutputSummary({
    answerChars: 0,
    citationsCount: null,
    cacheHit: null,
    insufficient: null,
    finishReason,
    errorCategory,
  });
  finalizeChatTrace(state, () => {}, {
    requestAborted: finishReason === "aborted",
  });
  return observations.filter((o) => o.name.startsWith("request:"));
}

void describe("chat trace failure markers", () => {
  void it("emits request:aborted through the trace, not the ingestion API", () => {
    const markers = finalizeWith("aborted");
    assert.equal(markers.length, 1);
    assert.equal(markers[0]?.name, "request:aborted");
    assert.equal(markers[0]?.level, "WARNING");
    assert.equal(markers[0]?.statusMessage, "client aborted the request");
  });

  void it("emits request:error carrying the error category", () => {
    const markers = finalizeWith("error", "upstream_timeout");
    assert.equal(markers.length, 1);
    assert.equal(markers[0]?.name, "request:error");
    assert.equal(markers[0]?.level, "ERROR");
    assert.equal(markers[0]?.statusMessage, "upstream_timeout");
  });

  void it("falls back to a generic message when no category was recorded", () => {
    const markers = finalizeWith("error");
    assert.equal(markers[0]?.statusMessage, "unknown error");
  });

  void it("emits no marker for a successful request", () => {
    assert.deepEqual(finalizeWith("success"), []);
  });
});

// The suite above pre-populates state.outputSummary and passes a no-op
// updateTrace, so it never exercises the exits that reach finalize without a
// summary -- an abort or an early throw. Those take the fallback branch, which
// writes the summary through the injected updater rather than assigning it to
// the state, while the marker below reads state.outputSummary. The two agree
// only because createTraceUpdater writes back into the state it was built
// from, and the handler passes exactly that updater. Swapping in a pure
// updater would silently stop emitting failure markers, so these cases use the
// production wiring.
function finalizeSummaryLess({ requestAborted }: { requestAborted: boolean }): {
  state: ReturnType<typeof createChatTraceState>;
  markers: LangfuseObservationOptions[];
} {
  const { trace, observations } = createTraceSpy();
  const state = createChatTraceState();
  state.trace = trace;
  assert.equal(state.outputSummary, null);
  finalizeChatTrace(state, createTraceUpdater(state), { requestAborted });
  return {
    state,
    markers: observations.filter((o) => o.name.startsWith("request:")),
  };
}

void describe("chat trace failure markers — summary-less exits", () => {
  void it("emits request:aborted when the request aborted before any summary was recorded", () => {
    const { state, markers } = finalizeSummaryLess({ requestAborted: true });

    // The marker must agree with the trace output the fallback just wrote.
    assert.equal(state.outputSummary?.finish_reason, "aborted");
    assert.equal(state.metadata?.aborted, true);
    assert.equal(markers.length, 1);
    assert.equal(markers[0]?.name, "request:aborted");
    assert.equal(markers[0]?.level, "WARNING");
    assert.equal(markers[0]?.statusMessage, "client aborted the request");
  });

  void it("emits request:error when an exit produced no summary and no abort", () => {
    const { state, markers } = finalizeSummaryLess({ requestAborted: false });

    assert.equal(state.outputSummary?.finish_reason, "error");
    assert.equal(state.metadata?.aborted, false);
    assert.equal(markers.length, 1);
    assert.equal(markers[0]?.name, "request:error");
    assert.equal(markers[0]?.level, "ERROR");
    // The fallback stamps error_category "unknown" on the summary, and the
    // marker prefers that over its own "unknown error" default.
    assert.equal(markers[0]?.statusMessage, "unknown");
    assert.equal(state.outputSummary?.error_category, "unknown");
  });
});
