import assert from "node:assert/strict";
import test from "node:test";

import {
  percentile,
  renderReport,
  type ResultRow,
  type ScoreRow,
  summarize,
} from "@/scripts/local-llm-bakeoff/summarize";

void test("percentile uses nearest rank", () => {
  const values = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5];
  assert.equal(percentile(values, 50), 5);
  assert.equal(percentile(values, 95), 10);
  assert.equal(percentile([], 50), null);
});

function speedRows(
  variant: string,
  ttftMs: number,
  decode: number,
): ResultRow[] {
  return ["q1", "q2"].flatMap((itemId) => [
    {
      variant,
      pass: "baseline",
      itemId,
      rep: 1,
      ok: true,
      ttftMs,
      decodeTokensPerSecond: decode,
    },
    {
      variant,
      pass: "concurrent",
      itemId,
      rep: 1,
      ok: true,
      ttftMs: ttftMs * 2,
      decodeTokensPerSecond: decode,
    },
  ]);
}

function score(
  variant: string,
  itemId: string,
  kind: string,
  overrides: Partial<ScoreRow> = {},
): ScoreRow {
  return {
    variant,
    itemId,
    kind,
    grounded: true,
    correctness: 5,
    refused: kind === "out_of_scope",
    format_ok: true,
    language_match: true,
    ...overrides,
  };
}

const reference = [
  score("gpt-6-luna", "q1", "project"),
  score("gpt-6-luna", "q2", "out_of_scope"),
];

void test("a fast, grounded variant passes and the reference is marked as such", () => {
  const results: ResultRow[] = [
    ...speedRows("fast", 800, 60),
    { variant: "fast", pass: "memory", itemId: "-", rep: 0, deltaBytes: 18e9 },
  ];
  const scores = [
    ...reference,
    score("fast", "q1", "project"),
    score("fast", "q2", "out_of_scope"),
  ];
  const summaries = summarize(results, scores, []);
  const [fast, luna] = summaries;
  assert.ok(fast && luna);
  assert.equal(fast.variant, "fast");
  assert.equal(fast.gate, "pass");
  assert.equal(fast.fits20Gb, true);
  assert.equal(fast.concurrentTtftP95Ms, 1600);
  assert.equal(luna.gate, "reference");
  assert.match(renderReport(summaries), /\| fast \| pass \|/);
});

void test("slow decoding fails; an unreviewed ungrounded flag is pending; a confirmed one fails", () => {
  const scores = [
    ...reference,
    score("slow", "q1", "project"),
    score("slow", "q2", "out_of_scope"),
    score("shaky", "q1", "project", {
      grounded: false,
      ungrounded_claims: ["invented employer"],
    }),
    score("shaky", "q2", "out_of_scope"),
  ];
  const results = [
    ...speedRows("slow", 800, 20),
    ...speedRows("shaky", 800, 60),
  ];
  const pending = summarize(results, scores, []);
  assert.deepEqual(pending.find((s) => s.variant === "slow")?.failedCriteria, [
    "decode_p50",
  ]);
  assert.equal(
    pending.find((s) => s.variant === "shaky")?.gate,
    "pending-review",
  );
  const confirmed = summarize(results, scores, [
    { variant: "shaky", itemId: "q1", confirmedUngrounded: true },
  ]);
  assert.deepEqual(
    confirmed.find((s) => s.variant === "shaky")?.failedCriteria,
    ["groundedness"],
  );
});
