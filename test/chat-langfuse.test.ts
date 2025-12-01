import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideTelemetryMode } from "@/lib/telemetry/chat-langfuse";

const always = (value: number) => () => value;

describe("decideTelemetryMode", () => {
  it("disables tracing when sampleRate is zero", () => {
    const decision = decideTelemetryMode(0, "standard", always(0.5));
    assert.equal(decision.shouldEmitTrace, false);
    assert.equal(decision.includeConfigSnapshot, false);
    assert.equal(decision.includeRetrievalDetails, false);
  });

  it("always emits when sampleRate is one", () => {
    const decision = decideTelemetryMode(1, "standard", always(0.9));
    assert.equal(decision.shouldEmitTrace, true);
    assert.equal(decision.includeConfigSnapshot, true);
    assert.equal(decision.includeRetrievalDetails, false);
  });

  it("emits when random sample is below threshold", () => {
    const decision = decideTelemetryMode(0.1, "minimal", always(0.05));
    assert.equal(decision.shouldEmitTrace, true);
    assert.equal(decision.includeConfigSnapshot, false);
    assert.equal(decision.includeRetrievalDetails, false);
  });

  it("skips when random sample exceeds threshold", () => {
    const decision = decideTelemetryMode(0.1, "verbose", always(0.5));
    assert.equal(decision.shouldEmitTrace, false);
    assert.equal(decision.includeConfigSnapshot, false);
    assert.equal(decision.includeRetrievalDetails, false);
  });

  it("honors detail level for config snapshot and retrieval details", () => {
    const minimal = decideTelemetryMode(1, "minimal", always(0.5));
    assert.equal(minimal.includeConfigSnapshot, false);
    assert.equal(minimal.includeRetrievalDetails, false);

    const standard = decideTelemetryMode(1, "standard", always(0.5));
    assert.equal(standard.includeConfigSnapshot, true);
    assert.equal(standard.includeRetrievalDetails, false);

    const verbose = decideTelemetryMode(1, "verbose", always(0.5));
    assert.equal(verbose.includeConfigSnapshot, true);
    assert.equal(verbose.includeRetrievalDetails, true);
  });
});
