import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatConfigSnapshot } from "@/lib/rag/types";
import { buildTelemetryConfigSnapshot } from "@/lib/server/telemetry/telemetry-config-snapshot";

import { buildTestChatConfigSnapshot } from "./helpers/chat-builders";

const baseConfig: ChatConfigSnapshot = buildTestChatConfigSnapshot();

void describe("buildTelemetryConfigSnapshot", () => {
  void it("produces consistent hashes regardless of object key order", () => {
    const resultA = buildTelemetryConfigSnapshot(baseConfig);
    const reordered: ChatConfigSnapshot = {
      ...baseConfig,
      rag: {
        ...baseConfig.rag,
        ranking: {
          docTypeWeights: { blog: 2, official: 1 },
          personaTypeWeights: { expert: 1.5 },
        },
      },
    };
    const resultB = buildTelemetryConfigSnapshot(reordered);
    assert.strictEqual(resultA.configHash, resultB.configHash);
  });

  void it("changes hash when a meaningful field flips", () => {
    const baseResult = buildTelemetryConfigSnapshot(baseConfig);
    const modified: ChatConfigSnapshot = {
      ...baseConfig,
      rag: {
        ...baseConfig.rag,
        topK: baseConfig.rag.topK + 1,
      },
    };
    const modifiedResult = buildTelemetryConfigSnapshot(modified);
    assert.notStrictEqual(baseResult.configHash, modifiedResult.configHash);
  });

  void it("returns a summary matching the expected shape", () => {
    const { configSummary } = buildTelemetryConfigSnapshot(baseConfig);
    assert.strictEqual(configSummary.presetKey, "default");
    assert.deepStrictEqual(configSummary.engine, {
      safeMode: false,
      llmModel: "mistral-ollama",
      embeddingModel: "text-embedding-3-small",
    });
    assert.strictEqual(configSummary.rag.topK, 6);
    assert.strictEqual(configSummary.cache.responseEnabled, true);
    assert.strictEqual(configSummary.ranking?.hasDocTypeWeights, true);
    assert.strictEqual(typeof configSummary.ranking?.rankingHash, "string");
  });
});
