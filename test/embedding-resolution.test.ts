import assert from "node:assert/strict";
import test from "node:test";

import type { RankerId } from "@/lib/shared/models";
import type { SessionChatConfig } from "@/types/chat-config";
import { resolveEmbeddingSpace } from "@/lib/core/embedding-spaces";
import {
  type ChatModelSettings,
  getChatModelDefaults,
  resolveSessionEmbeddingRequest,
} from "@/lib/server/chat-settings";
import {
  type EmbeddingProviderAvailability,
  enforceEmbeddingProviderAvailability,
} from "@/lib/server/telemetry/embedding-trace";

const buildSessionConfig = (
  defaults: ChatModelSettings,
  overrides: Partial<SessionChatConfig> = {},
): SessionChatConfig => ({
  presetId: overrides.presetId,
  additionalSystemPrompt: overrides.additionalSystemPrompt,
  llmModel: defaults.llmModelId,
  embeddingModel: overrides.embeddingModel ?? defaults.embeddingModel,
  embeddingSpaceId: overrides.embeddingSpaceId,
  embeddingProvider: overrides.embeddingProvider,
  embeddingModelId: overrides.embeddingModelId,
  rag: overrides.rag ?? { enabled: true, topK: 5, similarity: 0.78 },
  context:
    overrides.context ?? {
      tokenBudget: 1200,
      historyBudget: 600,
      clipTokens: 64,
    },
  features: {
    reverseRAG: overrides.features?.reverseRAG ?? false,
    hyde: overrides.features?.hyde ?? false,
    ranker: overrides.features?.ranker ?? ("none" as RankerId),
  },
  summaryLevel: overrides.summaryLevel ?? "off",
  appliedPreset: overrides.appliedPreset,
  safeMode: overrides.safeMode,
  requireLocal: overrides.requireLocal,
});

void test("enforceEmbeddingProviderAvailability flags provider_disabled instead of fallback", () => {
  const geminiSpace = resolveEmbeddingSpace({ provider: "gemini" });
  const openAiSpace = resolveEmbeddingSpace({ provider: "openai" });
  const availability: EmbeddingProviderAvailability = {
    openaiEnabled: true,
    geminiEnabled: false,
    missingOpenaiKey: false,
    missingGeminiKey: true,
  };

  const result = enforceEmbeddingProviderAvailability(
    geminiSpace,
    availability,
    (provider) => (provider === "openai" ? openAiSpace : null),
  );

  assert.equal(result.reason, "provider_disabled");
  assert.equal(result.selection.provider, "openai");
  assert.equal(result.fallbackFrom?.provider, "gemini");
  assert.equal(
    result.fallbackFrom?.embeddingSpaceId,
    geminiSpace.embeddingSpaceId,
  );
});

void test("resolveSessionEmbeddingRequest remaps legacy embeddingModel space ids", () => {
  const defaults = getChatModelDefaults();
  const sessionConfig = buildSessionConfig(defaults, {
    embeddingModel: "gemini_te4_v1",
  });
  const request = resolveSessionEmbeddingRequest({
    sessionConfig,
    preset: null,
    defaults,
  });
  assert.strictEqual(request.source, "sessionConfig_legacy");
  assert.strictEqual(request.requestedEmbeddingSpaceId, "gemini_te4_v1");
  assert.strictEqual(request.requestedProvider, "gemini");
  assert.strictEqual(request.legacyMapping?.value, "gemini_te4_v1");
});

void test("resolveSessionEmbeddingRequest respects explicit session overrides", () => {
  const defaults = getChatModelDefaults();
  const sessionConfig = buildSessionConfig(defaults, {
    embeddingModel: "gemini_te4_v1",
    embeddingSpaceId: "gemini_te4_v1",
    embeddingProvider: "gemini",
    embeddingModelId: "text-embedding-004",
  });
  const request = resolveSessionEmbeddingRequest({
    sessionConfig,
    preset: null,
    defaults,
  });
  assert.strictEqual(request.source, "sessionConfig");
  assert.strictEqual(request.requestedEmbeddingSpaceId, "gemini_te4_v1");
  assert.strictEqual(request.requestedProvider, "gemini");
  assert.strictEqual(request.legacyMapping, undefined);
  assert.strictEqual(request.requestedEmbeddingModelId, "text-embedding-004");
});
