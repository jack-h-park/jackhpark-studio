import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import {
  clearRequestTrace,
  createTelemetryBuffer,
  getRequestTrace,
} from "@/lib/server/telemetry/telemetry-buffer";

const exporter = new InMemorySpanExporter();
const previousEnv = { ...process.env };

before(() => {
  process.env.TELEMETRY_ENABLED = "1";
  process.env.LANGFUSE_OTEL_TRACING = "1";
  process.env.LANGFUSE_BASE_URL = "http://langfuse.test";
  process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
  process.env.LANGFUSE_SECRET_KEY = "sk-test";
  new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  }).register();
});

after(() => {
  process.env = previousEnv;
});

beforeEach(() => {
  exporter.reset();
});

void describe("telemetry buffer trace ownership", () => {
  void it("reuses the request trace after the registry entry is cleared", async () => {
    const requestId = "req-reuse-1";
    const buffer = createTelemetryBuffer({ requestId, question: "hi" });

    const created = await buffer.ensureTrace();
    assert.ok(created, "ensureTrace should create the root trace");
    assert.equal(getRequestTrace(requestId), created);

    buffer.push("handler-start");

    // The handler's `finally` clears the registry synchronously, while the
    // buffer flush is deferred to waitUntil/setImmediate.
    clearRequestTrace(requestId);
    await buffer.flush();
    created.end?.();

    const finished = exporter.getFinishedSpans();
    const roots = finished.filter((s) => s.name === "langchain-chat");
    assert.equal(roots.length, 1, "exactly one root span per request");

    const summary = finished.find((s) => s.name === "response-summary");
    assert.ok(summary, "response-summary should be exported");
    assert.equal(
      summary.parentSpanContext?.spanId,
      roots[0].spanContext().spanId,
      "response-summary must hang off the exported root, not an orphan",
    );
  });
});
