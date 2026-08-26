import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";

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

afterEach(() => {
  exporter.reset();
});

function spansByName() {
  return new Map(exporter.getFinishedSpans().map((s) => [s.name, s]));
}

void describe("OTel trace backend", () => {
  void it("does not export the root until end() is called", async () => {
    const trace = createOtelTrace({ name: "langchain-chat" }, "dev");
    await trace.update({ output: { finish_reason: "stop" } });

    assert.equal(
      exporter.getFinishedSpans().length,
      0,
      "update() must accumulate, never export — v4 rejects re-ingesting an id",
    );

    trace.end?.();
    assert.equal(spansByName().has("langchain-chat"), true);
  });

  void it("nests observations under the root and exports them immediately", async () => {
    const trace = createOtelTrace({ name: "langchain-chat" }, "dev");
    await trace.observation({
      name: "retrieve",
      startTime: new Date(1000).toISOString(),
      endTime: new Date(2000).toISOString(),
    });

    const child = spansByName().get("retrieve");
    assert.ok(child, "child span should be exported when it ends");
    assert.equal(child.spanContext().traceId, trace.traceId);
    assert.ok(child.parentSpanContext, "child must have a parent");

    trace.end?.();
    const root = spansByName().get("langchain-chat");
    assert.ok(root);
    assert.equal(
      child.parentSpanContext?.spanId,
      root.spanContext().spanId,
      "child should hang off the root, not float at trace level",
    );
  });

  void it("copies trace-level attributes onto every child", async () => {
    const trace = createOtelTrace(
      {
        name: "langchain-chat",
        sessionId: "session-1",
        userId: "user-1",
        tags: ["prod"],
      },
      "dev",
    );
    await trace.observation({ name: "retrieve" });
    trace.end?.();

    // v4 queries observations directly, so attributes that live only on the
    // root cannot filter its children.
    for (const name of ["langchain-chat", "retrieve"]) {
      const span = spansByName().get(name);
      assert.ok(span, `${name} should be exported`);
      assert.equal(span.attributes["session.id"], "session-1", name);
      assert.equal(span.attributes["user.id"], "user-1", name);
      assert.deepEqual(span.attributes["langfuse.trace.tags"], ["prod"], name);
      assert.equal(
        span.attributes["langfuse.trace.name"],
        "langchain-chat",
        name,
      );
    }
  });

  void it("carries the accumulated input and output onto the root observation", async () => {
    const trace = createOtelTrace(
      { name: "langchain-chat", input: { question_length: 42 } },
      "dev",
    );
    await trace.update({ output: { finish_reason: "stop" } });
    await trace.update({ metadata: { requestId: "req-1" } });
    trace.end?.();

    const root = spansByName().get("langchain-chat");
    assert.ok(root);
    // v4 has no trace-level input/output; it belongs on the root observation.
    assert.match(
      String(root.attributes["langfuse.observation.input"]),
      /question_length/,
    );
    assert.match(
      String(root.attributes["langfuse.observation.output"]),
      /finish_reason/,
    );
  });

  void it("is idempotent on end() and drops observations created afterwards", async () => {
    const trace = createOtelTrace({ name: "langchain-chat" }, "dev");
    trace.end?.();
    trace.end?.();
    await trace.observation({ name: "late" });

    const finished = exporter.getFinishedSpans();
    assert.equal(finished.filter((s) => s.name === "langchain-chat").length, 1);
    assert.equal(
      finished.some((s) => s.name === "late"),
      false,
      "a span created after the root closed would be an orphan",
    );
  });
});
