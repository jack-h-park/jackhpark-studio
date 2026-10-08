// test/local-llm-bakeoff-judge.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJudgePrompt,
  JUDGE_SCHEMA,
  parseVerdict,
} from "@/scripts/local-llm-bakeoff/judge";

const item = {
  id: "q1",
  lang: "en" as const,
  kind: "project" as const,
  messages: [
    { role: "system" as const, content: "Context: Jack built X." },
    { role: "user" as const, content: "What did Jack build?" },
  ],
  temperature: null,
  maxTokens: null,
};

const verdict = {
  grounded: true,
  ungrounded_claims: [],
  correctness: 5,
  refused: false,
  format_ok: true,
  language_match: true,
  rationale: "Supported.",
};

void test("the judge prompt carries the full assistant input and the answer", () => {
  const prompt = buildJudgePrompt(item, "He built X.");
  assert.match(prompt, /<system>\nContext: Jack built X\.\n<\/system>/);
  assert.match(prompt, /<user>\nWhat did Jack build\?\n<\/user>/);
  assert.match(prompt, /<answer_to_grade>\nHe built X\.\n<\/answer_to_grade>/);
});

void test("the schema requires every property it declares", () => {
  assert.deepEqual(
    [...JUDGE_SCHEMA.required].toSorted(),
    Object.keys(JUDGE_SCHEMA.properties).toSorted(),
  );
});

void test("parseVerdict accepts a complete verdict and rejects a broken one", () => {
  assert.deepEqual(parseVerdict(JSON.stringify(verdict)), verdict);
  const missing: Record<string, unknown> = { ...verdict };
  delete missing.grounded;
  assert.throws(
    () => parseVerdict(JSON.stringify(missing)),
    /missing grounded/,
  );
  assert.throws(
    () => parseVerdict(JSON.stringify({ ...verdict, correctness: 9 })),
    /out of range/,
  );
});
