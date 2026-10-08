// test/local-llm-bakeoff-judge.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJudgePrompt,
  JUDGE_SCHEMA,
  parseVerdict,
  planJudging,
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

const items = [item, { ...item, id: "q2" }];

void test("planJudging judges each variant|itemId once, keeping the first answer", () => {
  const plan = planJudging({
    items,
    answers: [
      { variant: "a", itemId: "q1", text: "first" },
      { variant: "a", itemId: "q1", text: "second" },
      { variant: "b", itemId: "q1", text: "other variant" },
      { variant: "a", itemId: "q2", text: "other item" },
    ],
    existingScores: [],
  });
  assert.deepEqual(plan.pending, [
    { variant: "a", itemId: "q1", text: "first" },
    { variant: "b", itemId: "q1", text: "other variant" },
    { variant: "a", itemId: "q2", text: "other item" },
  ]);
  assert.equal(plan.duplicateCount, 1);
  assert.deepEqual(plan.unknownItemIds, []);
});

void test("planJudging reports answers for items the fixture does not have", () => {
  const plan = planJudging({
    items,
    answers: [
      { variant: "a", itemId: "q1", text: "known" },
      { variant: "a", itemId: "gone", text: "stale" },
      { variant: "b", itemId: "gone", text: "stale" },
      { variant: "a", itemId: "typo", text: "stale" },
    ],
    existingScores: [],
  });
  assert.deepEqual(plan.unknownItemIds, ["gone", "typo"]);
  assert.deepEqual(
    plan.pending.map((answer) => answer.itemId),
    ["q1"],
  );
});

void test("planJudging retries judge errors except refusals, and skips judged rows", () => {
  const plan = planJudging({
    items,
    answers: [
      { variant: "ok", itemId: "q1", text: "x" },
      { variant: "refused", itemId: "q1", text: "x" },
      { variant: "errored", itemId: "q1", text: "x" },
      { variant: "recovered", itemId: "q1", text: "x" },
      { variant: "new", itemId: "q1", text: "x" },
    ],
    existingScores: [
      { variant: "ok", itemId: "q1", correctness: 5 },
      { variant: "refused", itemId: "q1", judgeError: "refusal" },
      { variant: "errored", itemId: "q1", judgeError: "overloaded" },
      { variant: "recovered", itemId: "q1", judgeError: "timeout" },
      { variant: "recovered", itemId: "q1", correctness: 4 },
    ],
  });
  assert.deepEqual(
    plan.pending.map((answer) => answer.variant),
    ["errored", "new"],
  );
});
