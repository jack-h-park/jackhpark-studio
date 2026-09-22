import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getGpt6FallbackModel,
  shouldFallbackBeforeStreaming,
} from "@/lib/server/api/gpt6-fallback-policy";

void test("each GPT-6 tier has its designated Anthropic fallback", () => {
  assert.equal(getGpt6FallbackModel("gpt-6-sol"), "claude-sonnet-5");
  assert.equal(getGpt6FallbackModel("gpt-6-luna"), "claude-haiku-4-5");
  assert.equal(getGpt6FallbackModel("gpt-4o-mini"), null);
});

void test("fallback is limited to retryable failures before response bytes", () => {
  assert.equal(shouldFallbackBeforeStreaming({ status: 429 }, false, true), true);
  assert.equal(shouldFallbackBeforeStreaming({ status: 503 }, false, true), true);
  assert.equal(
    shouldFallbackBeforeStreaming({ code: "ETIMEDOUT" }, false, true),
    true,
  );
  assert.equal(shouldFallbackBeforeStreaming({ status: 400 }, false, true), false);
  assert.equal(shouldFallbackBeforeStreaming({ status: 429 }, true, true), false);
  assert.equal(shouldFallbackBeforeStreaming({ status: 503 }, false, false), false);
});
