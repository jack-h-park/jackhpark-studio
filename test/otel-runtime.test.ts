import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { LangfuseSpanProcessor } from "@langfuse/otel";

import {
  flushLangfuseSpans,
  getLangfuseSpanProcessor,
  setLangfuseSpanProcessor,
} from "@/lib/server/telemetry/otel-runtime";

const PROCESSOR_KEY = "__jackhparkStudioLangfuseSpanProcessor__";

function clearProcessor() {
  delete (globalThis as unknown as Record<string, unknown>)[PROCESSOR_KEY];
}

function stubProcessor(forceFlush: () => Promise<void>): LangfuseSpanProcessor {
  return { forceFlush } as unknown as LangfuseSpanProcessor;
}

afterEach(clearProcessor);

void describe("otel span processor registry", () => {
  void it("returns null before instrumentation registers a processor", () => {
    clearProcessor();
    assert.equal(getLangfuseSpanProcessor(), null);
  });

  void it("flushing is a no-op when no processor is registered", async () => {
    clearProcessor();
    await assert.doesNotReject(() => flushLangfuseSpans());
  });

  void it("flushes the registered processor", async () => {
    let flushes = 0;
    setLangfuseSpanProcessor(
      stubProcessor(async () => {
        flushes += 1;
      }),
    );

    await flushLangfuseSpans();

    assert.equal(flushes, 1);
  });

  void it("propagates flush failures for the caller to log", async () => {
    // The caller attaches .catch inside its waitUntil drain; this module stays
    // dependency-free so it can be reached from the edge bundle.
    setLangfuseSpanProcessor(
      stubProcessor(() => Promise.reject(new Error("export failed"))),
    );

    await assert.rejects(() => flushLangfuseSpans(), /export failed/);
  });

  void it("shares the processor across module instances via globalThis", () => {
    // Next.js compiles instrumentation.ts into its own bundle, so a handler may
    // resolve a second copy of this module. The global key is what keeps both
    // copies pointing at the processor register() actually created.
    const processor = stubProcessor(async () => {});
    setLangfuseSpanProcessor(processor);

    const fromGlobal = (
      globalThis as unknown as Record<string, LangfuseSpanProcessor | undefined>
    )[PROCESSOR_KEY];

    assert.equal(fromGlobal, processor);
    assert.equal(getLangfuseSpanProcessor(), processor);
  });
});
