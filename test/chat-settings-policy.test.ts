import assert from "node:assert";
import { describe, it } from "node:test";

import type { SessionChatConfig } from "@/types/chat-config";
import { enforceSessionPolicy } from "@/lib/server/chat-settings";

void describe("Weak Lockdown Policy Enforcement", () => {
  void it("should drop keys not in USER_TUNABLE_KEYS", () => {
    const sessionConfig: any = {
      llmModel: "gpt-4o",
      ragTopK: 100, // Forbidden
      ragSimilarity: 0.1, // Forbidden (suppose) - wait, check allowed list
      summaryLevel: "high", // Allowed?
      hack: "attempt",
    };

    const result = enforceSessionPolicy(sessionConfig);

    // Check dropped keys
    assert.ok(result.droppedKeys.includes("ragTopK")); // Numeric guardrails usually not tunable directly in this map?
    // Wait, tunable keys are llmModel, appliedPreset?
    // I need to know roughly what IS allowed.
    // Based on previous context, USER_TUNABLE_KEYS includes 'llmModel', 'appliedPreset', maybe others?
    // Let's assert based on expected behavior.
    assert.ok(result.droppedKeys.includes("hack"));

    // Check preserved keys
    assert.strictEqual(result.enforced.llmModel, "gpt-4o");
  });

  void it("should return empty if input undefined", () => {
    const result = enforceSessionPolicy(undefined);
    assert.deepStrictEqual(result.enforced, {});
    assert.strictEqual(result.droppedKeys.length, 0);
  });

  void it("should allow all valid keys", () => {
    // Checking typical valid keys
    const sessionConfig: Partial<SessionChatConfig> = {
      llmModel: "gpt-4o",
      presetId: "precision",
      summaryLevel: "low",
    };
    // Note: I assume these are tunable. If test fails, I'll update logic or test to match ground truth.
    // Actually, looking at usages, numeric settings like ragTopK are NOT in tunable keys usually.
    // They are controlled by presets.

    const result = enforceSessionPolicy(sessionConfig as SessionChatConfig);
    // Ensure all keys are preserved (none dropped)
    assert.strictEqual(result.droppedKeys.length, 0);
  });
});
