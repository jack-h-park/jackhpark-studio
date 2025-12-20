import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRagK } from "@/lib/server/langchain/ragRetrievalChain";

void test("normalizeRagK adjusts retrieve/final when rerank disabled", () => {
  const result = normalizeRagK({
    retrieveK: 5,
    rerankK: null,
    finalK: 8,
    rerankEnabled: false,
  });

  assert.equal(result.retrieveK, 8);
  assert.equal(result.finalK, 8);
  assert.equal(result.rerankK, null);
});

void test("normalizeRagK defaults rerankK when enabled and preserves explicit", () => {
  const defaulted = normalizeRagK({
    retrieveK: 50,
    rerankK: undefined,
    finalK: 12,
    rerankEnabled: true,
  });

  assert.equal(defaulted.retrieveK, 50);
  assert.equal(defaulted.rerankK, 20);
  assert.equal(defaulted.finalK, 12);

  const explicit = normalizeRagK({
    retrieveK: 10,
    rerankK: 18,
    finalK: 12,
    rerankEnabled: true,
  });

  assert.equal(explicit.retrieveK, 18);
  assert.equal(explicit.rerankK, 18);
  assert.equal(explicit.finalK, 12);
});

void test("normalizeRagK clamps finalK under rerankK", () => {
  const result = normalizeRagK({
    retrieveK: 30,
    rerankK: 20,
    finalK: 25,
    rerankEnabled: true,
  });

  assert.equal(result.retrieveK, 30);
  assert.equal(result.rerankK, 20);
  assert.equal(result.finalK, 20);
});
