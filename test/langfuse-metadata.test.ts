import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCacheMetadata,
  buildGenerationInput,
  computeRetrievalUsed,
} from "@/lib/server/telemetry/langfuse-metadata";
import { stableHash } from "@/lib/server/telemetry/stable-hash";

import {
  buildTestGuardrails,
  buildTestTelemetryConfigSummary,
} from "./helpers/chat-builders";

const guardrails = buildTestGuardrails({
  similarityThreshold: 0.7,
  ragTopK: 5,
  ragContextTokenBudget: 2048,
  ragContextClipTokens: 1024,
  historyTokenBudget: 4096,
  summary: {
    enabled: true,
    triggerTokens: 512,
    maxChars: 2000,
    maxTurns: 5,
  },
  chitchatKeywords: ["hi"],
  fallbacks: {
    chitchat: "fallback-chat",
    command: "fallback-command",
  },
});
const configSummary = buildTestTelemetryConfigSummary({
  llmModel: "gpt-4",
  embeddingModel: "embedder",
  rag: {
    enabled: true,
    topK: 5,
    similarity: 0.65,
    ranker: "mmr",
    reverseRAG: false,
    hyde: false,
    summaryLevel: "standard",
  },
  context: {
    tokenBudget: 4096,
    historyBudget: 2048,
    clipTokens: 512,
  },
  telemetry: {
    detailLevel: "standard",
    sampleRate: 1,
  },
  prompt: {
    baseVersion: "base-v1",
  },
});

void describe("Langfuse metadata helpers", () => {
  void it("ensures generation input has intent/model/topK/settings_hash for knowledge", () => {
    const metadata = buildGenerationInput({
      intent: "knowledge",
      resolvedModel: "gpt-4-mini",
      provider: "provider",
      presetId: "default",
      detailLevel: "standard",
      guardrails,
      configSummary,
      configHash: null,
    });
    assert.equal(metadata.intent, "knowledge");
    assert.equal(metadata.model, "gpt-4-mini");
    assert.equal(metadata.topK, guardrails.ragTopK);
    assert.equal(metadata.settings_hash, stableHash(configSummary));
  });

  void it("omits topK for non-knowledge intents", () => {
    const metadata = buildGenerationInput({
      intent: "chitchat",
      resolvedModel: "gpt-4-mini",
      provider: "provider",
      presetId: "default",
      detailLevel: "standard",
      guardrails,
      configSummary,
      configHash: "config-hash",
    });
    assert.strictEqual(metadata.topK, null);
    assert.equal(metadata.settings_hash, "config-hash");
  });

  void it("builds canonical cache metadata and mirrors legacy response flag", () => {
    const canonical = buildCacheMetadata({
      intent: "knowledge",
      responseCacheEnabled: true,
      retrievalCacheEnabled: true,
      responseCacheHit: true,
      retrievalCacheHit: null,
    });
    assert.equal(canonical.cache.responseHit, true);
    assert.equal(canonical.cache.retrievalHit, null);
    assert.equal(canonical.responseCacheHit, canonical.cache.responseHit);
  });

  void it("computes retrieval_used as boolean for knowledge and null otherwise", () => {
    assert.equal(
      computeRetrievalUsed({
        intent: "knowledge",
        retrievedCount: 0,
      }),
      false,
    );
    assert.equal(
      computeRetrievalUsed({
        intent: "knowledge",
        finalSelectedCount: 2,
      }),
      true,
    );
    assert.equal(
      computeRetrievalUsed({
        intent: "chitchat",
      }),
      null,
    );
  });
});
