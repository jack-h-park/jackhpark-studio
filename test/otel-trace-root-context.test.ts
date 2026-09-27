// Pins runInContext, which is the whole mechanism Phase 5 rests on.
//
// The root observation is created with startObservation, which does NOT make
// it the active span, and our own observations are parented explicitly — so
// ambient OTel context is empty for most of a request. Instrumentation that
// parents itself from ambient context instead (the v5 LangChain
// CallbackHandler) would therefore open a trace of its own.
//
// This has no production-visible effect while the v3 handler is still in use:
// it is pre-OTel and reads nothing from context. These assertions are the only
// evidence the mechanism works before the handler swap lands.

import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";

import { startObservation } from "@langfuse/tracing";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import { createOtelTrace } from "@/lib/server/telemetry/otel-trace-backend";

const exporter = new InMemorySpanExporter();

before(() => {
  new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  }).register();
});

beforeEach(() => {
  exporter.reset();
});

function spanNamed(name: string) {
  const span = exporter.getFinishedSpans().find((s) => s.name === name);
  assert.ok(span, `expected a span named ${name}`);
  return span;
}

void describe("runInContext", () => {
  void it("parents an ambient-context span under the request root", () => {
    const trace = createOtelTrace({ name: "langchain-chat" }, "dev");
    trace.runInContext(() => {
      // No parentSpanContext: exactly how the v5 CallbackHandler starts one.
      startObservation("langgraph-node").end();
    });
    trace.end();

    const root = spanNamed("langchain-chat");
    const node = spanNamed("langgraph-node");
    assert.equal(
      node.spanContext().traceId,
      root.spanContext().traceId,
      "must share the request's trace",
    );
    assert.equal(node.parentSpanContext?.spanId, root.spanContext().spanId);
  });

  void it("keeps an async callee inside the context", async () => {
    const trace = createOtelTrace({ name: "langchain-chat" }, "dev");
    await trace.runInContext(async () => {
      await Promise.resolve();
      startObservation("after-await").end();
    });
    trace.end();

    assert.equal(
      spanNamed("after-await").parentSpanContext?.spanId,
      spanNamed("langchain-chat").spanContext().spanId,
    );
  });

  void it("returns the callee's value", () => {
    const trace = createOtelTrace({ name: "langchain-chat" }, "dev");
    assert.equal(
      trace.runInContext(() => 42),
      42,
    );
    trace.end();
  });

  void it("leaves ambient context untouched outside the call", () => {
    const trace = createOtelTrace({ name: "langchain-chat" }, "dev");
    trace.runInContext(() => undefined);
    startObservation("outside").end();
    trace.end();

    // Without this, every later span in the process would silently inherit a
    // finished request's root.
    assert.equal(spanNamed("outside").parentSpanContext, undefined);
  });
});
