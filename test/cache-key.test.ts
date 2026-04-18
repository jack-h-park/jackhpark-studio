import assert from "node:assert/strict";
import test from "node:test";

import {
  buildResponseCacheKeyPayload,
  buildRetrievalCacheKey,
  computeHistorySummaryHash,
} from "@/lib/server/api/chat-cache-keys";
import {
  clearMemoryCache,
  hashPayload,
  memoryCacheClient,
} from "@/lib/server/chat-cache";

import {
  buildTestResponseCacheArgs,
  buildTestRetrievalCacheArgs,
} from "./helpers/chat-builders";

void test("response cache key reflects resolved model/provider and summary state", () => {
  const baseSummaryHash = computeHistorySummaryHash(null);
  const baseArgs = buildTestResponseCacheArgs({
    summaryHash: baseSummaryHash,
  });

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
  const retrievalArgs = buildTestRetrievalCacheArgs();
  const firstKey = buildRetrievalCacheKey(retrievalArgs);
  await memoryCacheClient.set(firstKey, { hits: ["a"] }, 10);
  const secondKey = buildRetrievalCacheKey(retrievalArgs);
  assert.equal(firstKey, secondKey);
  const cached = await memoryCacheClient.get<{ hits: string[] }>(secondKey);
  assert.deepEqual(cached, { hits: ["a"] });
});
