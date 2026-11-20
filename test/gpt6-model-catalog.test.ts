import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveLlmModelId } from "@/lib/shared/model-resolution";
import { getLlmModelDefinition } from "@/lib/shared/models";

void test("GPT-6 tiers are selectable without sampling parameters", () => {
  for (const id of ["gpt-6.2-sol", "gpt-6-luna"]) {
    const model = getLlmModelDefinition(id);
    assert.equal(model?.provider, "openai");
    assert.equal(model?.model, id);
    assert.equal(model?.supportsSampling, false);
    assert.equal(model?.supportsReasoningEffort, true);
  }
});

void test("the designated Anthropic fallbacks remain resolvable", () => {
  assert.equal(getLlmModelDefinition("claude-sonnet-5")?.provider, "anthropic");
  assert.equal(
    getLlmModelDefinition("claude-haiku-4-5-20251001")?.provider,
    "anthropic",
  );
});

void test("saved Sol selections remain eligible under a legacy allowlist", () => {
  for (const id of ["gpt-6-sol", "gpt-6.1-sol", "gpt-6.2-sol"]) {
    const resolution = resolveLlmModelId(id, {
      ollamaConfigured: false,
      lmstudioConfigured: false,
      defaultModelId: "gpt-6-luna",
      defaultModelExplicit: true,
      allowedModelIds: ["gpt-6-luna", "gpt-6-sol"],
    });
    assert.equal(resolution.resolvedModelId, "gpt-6.2-sol");
    assert.equal(resolution.reason, "NONE");
  }
});
