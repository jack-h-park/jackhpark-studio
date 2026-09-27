// The evidence Phase 5 rests on: that the v5 CallbackHandler's spans join the
// request's trace instead of opening one of their own.
//
// This is what the earlier design assumed would happen for free. It does not:
// the handler takes its parent from ambient OTel context, and the request root
// is not active unless runInContext makes it so. The pairing of the two is the
// whole change, so it is asserted directly rather than through the golden.
//
// A real LangChain runnable is driven, not a simulated span, because the
// question is whether the handler reproduces the run hierarchy — something a
// hand-rolled span cannot answer. No network: spans go to an in-memory
// exporter and the runnable is a plain lambda.

import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";

import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import { buildLinkedLangfuseCallbacks } from "@/lib/server/langchain/langfuse-callbacks";
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

// A sequence, not a lambda calling another lambda: LangChain does not
// propagate run config into an invoke() made inside a lambda body, so that
// shape produces no child run and would test nothing about hierarchy.
const stepOne = RunnableLambda.from((value: string) => `${value}-a`).withConfig(
  {
    runName: "step-one",
  },
);
const stepTwo = RunnableLambda.from((value: string) => `${value}-b`).withConfig(
  {
    runName: "step-two",
  },
);
const chain = RunnableSequence.from([stepOne, stepTwo]).withConfig({
  runName: "answer-chain",
});

async function runChain(insideContext: boolean) {
  const trace = createOtelTrace({ name: "langchain-chat" }, "dev");
  const callbacks = buildLinkedLangfuseCallbacks({
    trace,
    sessionId: "req-1",
    tags: ["rag:retrieval-graph"],
  });
  const invoke = () => chain.invoke("hello", { callbacks });
  await (insideContext ? trace.runInContext(invoke) : invoke());
  trace.end();

  const spans = exporter.getFinishedSpans();
  const root = spans.find((s) => s.name === "langchain-chat");
  assert.ok(root, "root span missing");
  return { spans, root };
}

void describe("v5 LangChain handler nesting", () => {
  void it("puts the chain's spans in the request trace when run in context", async () => {
    const { spans, root } = await runChain(true);

    const chainSpans = spans.filter((s) => s.name !== "langchain-chat");
    assert.ok(chainSpans.length > 0, "handler emitted no spans at all");

    const rootTraceId = root.spanContext().traceId;
    const strays = chainSpans.filter(
      (s) => s.spanContext().traceId !== rootTraceId,
    );
    assert.deepEqual(
      strays.map((s) => s.name),
      [],
      "every chain span must share the request's trace",
    );
  });

  void it("reproduces the chain's own hierarchy rather than flattening it", async () => {
    const { spans, root } = await runChain(true);
    const byName = new Map(spans.map((s) => [s.name, s]));
    const chainSpan = byName.get("answer-chain");
    const stepSpan = byName.get("step-one");
    assert.ok(chainSpan && stepSpan, "expected the sequence and its step");

    // The sequence hangs off the request root; its steps hang off the
    // sequence. If the handler flattened onto ambient context instead of
    // tracking run_id/parent_run_id, both would name the root as parent.
    assert.equal(
      chainSpan.parentSpanContext?.spanId,
      root.spanContext().spanId,
    );
    assert.equal(
      stepSpan.parentSpanContext?.spanId,
      chainSpan.spanContext().spanId,
    );
  });

  void it("opens a separate trace when NOT run in context", async () => {
    // Pins the failure this phase exists to remove, so that losing
    // runInContext at a call site fails here instead of silently in prod.
    const { spans, root } = await runChain(false);
    const chainSpans = spans.filter((s) => s.name !== "langchain-chat");
    const rootTraceId = root.spanContext().traceId;
    assert.ok(
      chainSpans.every((s) => s.spanContext().traceId !== rootTraceId),
      "expected the handler to fragment without the ambient root",
    );
  });
});
