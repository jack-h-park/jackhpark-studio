import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_ADMIN_CHAT_PRESETS } from "@/lib/server/admin-chat-config";

void test("default preset matches the approved Balanced settings", () => {
  const balanced = DEFAULT_ADMIN_CHAT_PRESETS.default;
  assert.strictEqual(balanced.llmModel, "gpt-4o");
  assert.strictEqual(balanced.rag.topK, 6);
  assert.strictEqual(balanced.rag.similarity, 0.4);
  assert.strictEqual(balanced.context.enabled, true);
  assert.strictEqual(balanced.features.reverseRAG, false);
  assert.strictEqual(balanced.summaryLevel, "low");
});

void test("High Recall preset only enables Reverse RAG and keeps HyDE off", () => {
  const highRecall = DEFAULT_ADMIN_CHAT_PRESETS.highRecall;
  assert.strictEqual(highRecall.features.reverseRAG, true);
  assert.strictEqual(highRecall.features.hyde, false);
  assert.strictEqual(highRecall.features.ranker, "mmr");
  assert.strictEqual(highRecall.rag.topK, 12);
  assert.strictEqual(highRecall.rag.similarity, 0.3);
});

void test("Fast and Precision presets respect their token budgets", () => {
  const fast = DEFAULT_ADMIN_CHAT_PRESETS.fast;
  const precision = DEFAULT_ADMIN_CHAT_PRESETS.precision;
  assert.strictEqual(fast.llmModel, "gpt-4o-mini");
  assert.strictEqual(fast.context.enabled, true);
  assert.strictEqual(fast.context.tokenBudget, 1536);
  assert.strictEqual(fast.context.historyBudget, 512);
  assert.strictEqual(fast.context.clipTokens, 64);
  assert.strictEqual(precision.context.tokenBudget, 2048);
  assert.strictEqual(precision.context.historyBudget, 768);
  assert.strictEqual(precision.summaryLevel, "off");
});
