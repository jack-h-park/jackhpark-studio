import assert from "node:assert/strict";
import test from "node:test";

import { createChatModel } from "@/lib/server/api/llm-provider-factory";

function invocationParams(model: unknown): Record<string, unknown> {
  return (
    model as { invocationParams: () => Record<string, unknown> }
  ).invocationParams();
}

void test("GPT-6 OpenAI requests use max_completion_tokens and omit sampling", async () => {
  process.env.OPENAI_API_KEY = "test-openai-key";

  for (const model of ["gpt-6-sol", "gpt-6-luna"]) {
    const llm = await createChatModel("openai", model, 0.2, 32, "low");
    const params = invocationParams(llm);

    assert.equal(params.max_completion_tokens, 32, `${model} completion limit`);
    assert.equal(params.max_tokens, undefined, `${model} legacy token limit`);
    assert.equal(params.temperature, undefined, `${model} sampling parameter`);
  }
});

void test("Claude Sonnet 5 omits its unsupported temperature parameter", async () => {
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

  const llm = await createChatModel("anthropic", "claude-sonnet-5", 0.2, 32);
  const params = invocationParams(llm);

  assert.equal(params.temperature, undefined);
});
