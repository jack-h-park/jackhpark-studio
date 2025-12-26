import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attachLangfuseTraceTags,
  buildLangfuseTraceTags,
} from "@/lib/server/telemetry/langfuse-tags";

const createTraceStub = () => {
  const calls: Array<{ tags?: string[] }> = [];
  const trace = {
    traceId: "trace-id",
    id: "trace-id",
    environment: "dev",
    observation: async () => {
      // no-op
    },
    update: async (options: { tags?: string[] }) => {
      calls.push(options);
    },
  };
  return { trace, calls };
};

void describe("Langfuse tag helpers", () => {
  void it("builds normalized intent/preset/env tags", () => {
    const tags = buildLangfuseTraceTags({
      intent: "knowledge",
      presetKey: "default",
      environment: "prod",
    });
    assert.ok(tags.includes("intent:knowledge"));
    assert.ok(tags.includes("preset:default"));
    assert.ok(tags.includes("env:prod"));
  });

  void it("attaches tags when trace exists", () => {
    const { trace, calls } = createTraceStub();
    attachLangfuseTraceTags({
      trace,
      intent: "chitchat",
      presetKey: "fancy",
      environment: "dev",
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].tags, [
      "intent:chitchat",
      "preset:fancy",
      "env:dev",
    ]);
  });

  void it("skips tag updates when trace is null", () => {
    const { trace, calls } = createTraceStub();
    attachLangfuseTraceTags({
      trace: null,
      intent: "knowledge",
      presetKey: "default",
      environment: "prod",
    });
    assert.equal(calls.length, 0);
    attachLangfuseTraceTags({
      trace,
      intent: "",
      presetKey: "",
      environment: "",
    });
    assert.equal(calls.length, 1);
  });
});
