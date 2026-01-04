import assert from "node:assert/strict";
import test from "node:test";

import {
  buildResponseCacheKeyPayload,
  buildRetrievalCacheKey,
  computeHistorySummaryHash,
  type ResponseCacheKeyArgs,
  type RetrievalCacheKeyArgs,
} from "@/lib/server/api/langchain_chat_impl_heavy";
import {
  clearMemoryCache,
  hashPayload,
  memoryCacheClient,
} from "@/lib/server/chat-cache";

void test("response cache key reflects resolved model/provider and summary state", () => {
  const baseSummaryHash = computeHistorySummaryHash(null);
  const baseArgs: ResponseCacheKeyArgs = {
    presetId: "default",
    intent: "knowledge",
    messages: [{ role: "user", content: "Hi" }],
    guardrails: {
      ragTopK: 1,
      similarityThreshold: 0.5,
      ragContextTokenBudget: 100,
      ragContextClipTokens: 100,
    },
    runtimeFlags: {
      reverseRagEnabled: true,
      reverseRagMode: "precision",
      hydeEnabled: false,
      rankerMode: "none",
      hydeMode: "off",
      rewriteMode: "off",
      ragMultiQueryMode: "off",
      ragMultiQueryMaxQueries: 2,
    },
    decision: null,
    resolvedProvider: "openai",
    resolvedModelId: "gpt-4.1",
    requestedModelId: "gpt-4.1",
    summaryHash: baseSummaryHash,
  };

  const baseKey = hashPayload(buildResponseCacheKeyPayload(baseArgs));
  const diffModelKey = hashPayload(
    buildResponseCacheKeyPayload({
      ...baseArgs,
      resolvedModelId: "gpt-3.5",
    }),
  );
  assert.notEqual(baseKey, diffModelKey);

  const diffSummaryKey = hashPayload(
    buildResponseCacheKeyPayload({
      ...baseArgs,
      summaryHash: computeHistorySummaryHash("summary v1"),
    }),
  );
  assert.notEqual(baseKey, diffSummaryKey);
});

void test("retrieval cache key is deterministic so auto/multi can hit the cache", async () => {
  clearMemoryCache();
  const retrievalArgs: RetrievalCacheKeyArgs = {
    presetId: "default",
    question: "hello",
    ragTopK: 3,
    similarityThreshold: 0.5,
    candidateK: 15,
    reverseRagEnabled: true,
    reverseRagMode: "precision",
    hydeEnabled: false,
    rankerMode: "none",
    hydeMode: "off",
    rewriteMode: "off",
    ragMultiQueryMode: "off",
    ragMultiQueryMaxQueries: 2,
  };
  const firstKey = buildRetrievalCacheKey(retrievalArgs);
  await memoryCacheClient.set(firstKey, { hits: ["a"] }, 10);
  const secondKey = buildRetrievalCacheKey(retrievalArgs);
  assert.equal(firstKey, secondKey);
  const cached = await memoryCacheClient.get<{ hits: string[] }>(secondKey);
  assert.deepEqual(cached, { hits: ["a"] });
});
