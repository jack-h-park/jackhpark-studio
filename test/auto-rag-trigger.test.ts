import assert from "node:assert";
import { describe, it } from "node:test";

import { evaluateAutoTrigger } from "@/lib/server/api/langchain_chat_impl_heavy";

void describe("Auto RAG Trigger Logic", () => {
  const defaults = {
    forcedFlags: undefined,
    reverseRagDecision: { autoAllowed: true, capabilityEnabled: true },
    hydeDecision: { autoAllowed: true, capabilityEnabled: true },
    baseWeak: true,
    suppressAuto: false,
  };

  void it("should trigger strategies when allowed, enabled, and weak", () => {
    const result = evaluateAutoTrigger({ ...defaults });
    assert.strictEqual(result.shouldAutoRewrite, true);
    assert.strictEqual(result.shouldAutoHyde, true);
  });

  void it("should NOT trigger when base is strong (not weak)", () => {
    const result = evaluateAutoTrigger({ ...defaults, baseWeak: false });
    assert.strictEqual(result.shouldAutoRewrite, false);
    assert.strictEqual(result.shouldAutoHyde, false);
  });

  void it("should NOT trigger when capability is disabled", () => {
    const result = evaluateAutoTrigger({
      ...defaults,
      reverseRagDecision: { autoAllowed: true, capabilityEnabled: false },
      hydeDecision: { autoAllowed: true, capabilityEnabled: false },
    });
    assert.strictEqual(result.shouldAutoRewrite, false);
    assert.strictEqual(result.shouldAutoHyde, false);
  });

  void it("should FORCE trigger when forcedFlags are present, even if strong", () => {
    const result = evaluateAutoTrigger({
      ...defaults,
      baseWeak: false,
      forcedFlags: { reverseRag: true, hyde: true },
    });
    assert.strictEqual(result.shouldAutoRewrite, true);
    assert.strictEqual(result.shouldAutoHyde, true);
  });

  void it("should FORCE trigger when forcedFlags are present, even if capability disabled", () => {
    const result = evaluateAutoTrigger({
      ...defaults,
      reverseRagDecision: { autoAllowed: true, capabilityEnabled: false },
      forcedFlags: { reverseRag: true },
    });
    assert.strictEqual(result.shouldAutoRewrite, true);
  });

  void it("should suppress auto when suppression is on (e.g. high recall preset)", () => {
    const result = evaluateAutoTrigger({
      ...defaults,
      suppressAuto: true,
    });
    assert.strictEqual(result.shouldAutoRewrite, false);
    assert.strictEqual(result.shouldAutoHyde, false);
  });

  void it("should allow partial triggers (e.g. only rewrite forced)", () => {
    const result = evaluateAutoTrigger({
      ...defaults,
      baseWeak: false,
      forcedFlags: { reverseRag: true, hyde: false },
    });
    assert.strictEqual(result.shouldAutoRewrite, true);
    assert.strictEqual(result.shouldAutoHyde, false);
  });
});
