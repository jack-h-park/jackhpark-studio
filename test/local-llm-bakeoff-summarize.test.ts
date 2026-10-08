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

void test("majority-failed baseline rows: p50 and p95 both Infinity", () => {
  const results: ResultRow[] = [
    {
      variant: "mostly-fail",
      pass: "baseline",
      itemId: "f1",
      rep: 1,
      ok: false,
    },
    {
      variant: "mostly-fail",
      pass: "baseline",
      itemId: "f2",
      rep: 1,
      ok: false,
    },
    {
      variant: "mostly-fail",
      pass: "baseline",
      itemId: "f3",
      rep: 1,
      ok: false,
    },
    {
      variant: "mostly-fail",
      pass: "baseline",
      itemId: "q1",
      rep: 1,
      ok: true,
      ttftMs: 800,
      decodeTokensPerSecond: 60,
    },
    {
      variant: "mostly-fail",
      pass: "baseline",
      itemId: "q2",
      rep: 1,
      ok: true,
      ttftMs: 800,
      decodeTokensPerSecond: 60,
    },
  ];
  const scores = [
    ...reference,
    ...Array.from({ length: 5 }, (_, i) =>
      score("mostly-fail", i < 3 ? `f${i + 1}` : `q${i - 2}`, "project"),
    ),
  ];
  const summaries = summarize(results, scores, []);
  const mostly = summaries.find((s) => s.variant === "mostly-fail");
  assert.ok(mostly);
  assert.equal(mostly.ttftP50Ms, Infinity);
  assert.equal(mostly.ttftP95Ms, Infinity);
  assert.ok(mostly.failedCriteria.includes("ttft_p50"));
  assert.ok(mostly.failedCriteria.includes("ttft_p95"));
});

void test("ok: true row with missing ttftMs contributes Infinity", () => {
  const results: ResultRow[] = [
    {
      variant: "no-ttft",
      pass: "baseline",
      itemId: "q1",
      rep: 1,
      ok: true,
      decodeTokensPerSecond: 60,
    },
    {
      variant: "no-ttft",
      pass: "baseline",
      itemId: "q2",
      rep: 1,
      ok: true,
      ttftMs: 800,
      decodeTokensPerSecond: 60,
    },
  ];
  const scores = [
    ...reference,
    score("no-ttft", "q1", "project"),
    score("no-ttft", "q2", "out_of_scope", { refused: true }),
  ];
  const summaries = summarize(results, scores, []);
  const noTtft = summaries.find((s) => s.variant === "no-ttft");
  assert.ok(noTtft);
  // ttftValues([q1 ok=true no ttftMs, q2 ok=true ttftMs=800]) = [Infinity, 800]
  // Sorted = [800, Infinity]; p50 at index 0 = 800; p95 at index 1 = Infinity
  assert.equal(noTtft.ttftP50Ms, 800);
  assert.equal(noTtft.ttftP95Ms, Infinity);
  assert.ok(!noTtft.failedCriteria.includes("ttft_p50"));
  assert.ok(noTtft.failedCriteria.includes("ttft_p95"));
});

void test("failed baseline rows contribute Infinity to TTFT, failing the gate", () => {
  const results: ResultRow[] = [
    {
      variant: "flaky",
      pass: "baseline",
      itemId: "q1",
      rep: 1,
      ok: false,
      ttftMs: undefined,
    },
    {
      variant: "flaky",
      pass: "baseline",
      itemId: "q2",
      rep: 1,
      ok: true,
      ttftMs: 800,
      decodeTokensPerSecond: 60,
    },
  ];
  const scores = [
    ...reference,
    score("flaky", "q1", "project"),
    score("flaky", "q2", "out_of_scope", { refused: true }),
  ];
  const summaries = summarize(results, scores, []);
  const flaky = summaries.find((s) => s.variant === "flaky");
  assert.ok(flaky);
  assert.equal(flaky.ttftP95Ms, Infinity);
  assert.deepEqual(flaky.failedCriteria, ["ttft_p95"]);
  assert.match(renderReport(summaries), /∞/);
});

void test("20 fast rows + 1 failure: p95 of 21 values is the 20th (still fast)", () => {
  const results: ResultRow[] = [
    {
      variant: "mostly-ok",
      pass: "baseline",
      itemId: "fail",
      rep: 1,
      ok: false,
    },
    ...Array.from({ length: 20 }, (_, i) => ({
      variant: "mostly-ok" as const,
      pass: "baseline" as const,
      itemId: `q${i}`,
      rep: 1,
      ok: true as const,
      ttftMs: 500,
      decodeTokensPerSecond: 60,
    })),
  ];
  const scores = [
    ...reference,
    ...Array.from({ length: 21 }, (_, i) =>
      score("mostly-ok", i === 0 ? "fail" : `q${i - 1}`, "project"),
    ),
  ];
  const summaries = summarize(results, scores, []);
  const mostly = summaries.find((s) => s.variant === "mostly-ok");
  assert.ok(mostly);
  assert.equal(mostly.ttftP95Ms, 500);
  assert.ok(!mostly.failedCriteria.includes("ttft_p95"));
});

void test("judge errors bump gate to pending-review unless already failing", () => {
  const results: ResultRow[] = [...speedRows("judged", 800, 60)];
  const scores = [
    ...reference,
    score("judged", "q1", "project"),
    score("judged", "q2", "out_of_scope", { refused: true }),
    score("judged", "q3", "project", { judgeError: "timeout" }),
  ];
  const summaries = summarize(results, scores, []);
  const judged = summaries.find((s) => s.variant === "judged");
  assert.ok(judged);
  assert.equal(judged.judgeErrors, 1);
  assert.equal(judged.gate, "pending-review");
});

void test("judge error plus failing criterion stays fail", () => {
  const results: ResultRow[] = [
    {
      variant: "fail-and-judge",
      pass: "baseline",
      itemId: "q1",
      rep: 1,
      ok: true,
      ttftMs: 3500,
      decodeTokensPerSecond: 60,
    },
    {
      variant: "fail-and-judge",
      pass: "baseline",
      itemId: "q2",
      rep: 1,
      ok: true,
      ttftMs: 3500,
      decodeTokensPerSecond: 60,
    },
  ];
  const scores = [
    ...reference,
    score("fail-and-judge", "q1", "project"),
    score("fail-and-judge", "q2", "out_of_scope", {
      refused: true,
      judgeError: "timeout",
    }),
  ];
  const summaries = summarize(results, scores, []);
  const failJudge = summaries.find((s) => s.variant === "fail-and-judge");
  assert.ok(failJudge);
  assert.equal(failJudge.judgeErrors, 1);
  assert.ok(failJudge.failedCriteria.includes("ttft_p95"));
  assert.equal(failJudge.gate, "fail");
});

void test("quality ratio uses only items both scored without judgeError", () => {
  const results: ResultRow[] = [...speedRows("qual", 800, 60)];
  const scores = [
    { variant: "gpt-6-luna", itemId: "q1", kind: "project", correctness: 5 },
    {
      variant: "gpt-6-luna",
      itemId: "q2",
      kind: "project",
      correctness: 1,
    },
    { variant: "qual", itemId: "q1", kind: "project", correctness: 5 },
    {
      variant: "qual",
      itemId: "q2",
      kind: "project",
      correctness: 5,
      judgeError: "failed",
    },
  ] as ScoreRow[];
  const summaries = summarize(results, scores, []);
  const qual = summaries.find((s) => s.variant === "qual");
  assert.ok(qual);
  // Reference: q1=5, q2=1 (mean=3 if both; only q1 valid in common=5)
  // Variant: q1=5, q2=error (only q1 valid)
  // Common: q1 only, both have score 5, so ratio = 5/5 = 1.0
  // Old code would have: qual mean = 5, ref mean = 3, ratio ≈ 1.67
  assert.equal(qual.qualityRatio, 1.0);
});

void test("confirmedUngrounded: false clears the flag, allowing pass", () => {
  const results: ResultRow[] = [...speedRows("cleared", 800, 60)];
  const scores = [
    ...reference,
    score("cleared", "q1", "project", {
      grounded: false,
      ungrounded_claims: ["false claim"],
    }),
    score("cleared", "q2", "out_of_scope"),
  ];
  const reviews = [
    { variant: "cleared", itemId: "q1", confirmedUngrounded: false },
  ];
  const summaries = summarize(results, scores, reviews);
  const cleared = summaries.find((s) => s.variant === "cleared");
  assert.ok(cleared);
  assert.equal(cleared.confirmedUngrounded, 0);
  assert.equal(cleared.pendingReview, 0);
  assert.equal(cleared.gate, "pass");
});

void test("no reference rows → quality fails", () => {
  const results: ResultRow[] = [...speedRows("solo", 800, 60)];
  const scores = [
    score("solo", "q1", "project"),
    score("solo", "q2", "out_of_scope"),
  ];
  const summaries = summarize(results, scores, []);
  const solo = summaries.find((s) => s.variant === "solo");
  assert.ok(solo);
  assert.deepEqual(solo.failedCriteria, ["quality"]);
});

void test("threshold boundaries: ttft_p95 at 3000 passes, above fails", () => {
  const passResults: ResultRow[] = [
    {
      variant: "at-p95",
      pass: "baseline",
      itemId: "q1",
      rep: 1,
      ok: true,
      ttftMs: 3000,
    },
    {
      variant: "at-p95",
      pass: "baseline",
      itemId: "q2",
      rep: 1,
      ok: true,
      ttftMs: 3000,
    },
  ];
  const failResults: ResultRow[] = [
    {
      variant: "over-p95",
      pass: "baseline",
      itemId: "q1",
      rep: 1,
      ok: true,
      ttftMs: 3001,
    },
    {
      variant: "over-p95",
      pass: "baseline",
      itemId: "q2",
      rep: 1,
      ok: true,
      ttftMs: 3001,
    },
  ];
  const scores = [
    ...reference,
    score("at-p95", "q1", "project"),
    score("at-p95", "q2", "project"),
    score("over-p95", "q1", "project"),
    score("over-p95", "q2", "project"),
  ];
  const summaries = summarize([...passResults, ...failResults], scores, []);
  const atP95 = summaries.find((s) => s.variant === "at-p95");
  const overP95 = summaries.find((s) => s.variant === "over-p95");
  assert.ok(atP95 && overP95);
  assert.ok(!atP95.failedCriteria.includes("ttft_p95"));
  assert.ok(overP95.failedCriteria.includes("ttft_p95"));
});

void test("threshold boundaries: ttft_p50 at 1500 passes, above fails", () => {
  const passResults: ResultRow[] = [
    {
      variant: "at-p50",
      pass: "baseline",
      itemId: "q1",
      rep: 1,
      ok: true,
      ttftMs: 1500,
    },
    {
      variant: "at-p50",
      pass: "baseline",
      itemId: "q2",
      rep: 1,
      ok: true,
      ttftMs: 1500,
    },
  ];
  const failResults: ResultRow[] = [
    {
      variant: "over-p50",
      pass: "baseline",
      itemId: "q1",
      rep: 1,
      ok: true,
      ttftMs: 1501,
    },
    {
      variant: "over-p50",
      pass: "baseline",
      itemId: "q2",
      rep: 1,
      ok: true,
      ttftMs: 1501,
    },
  ];
  const scores = [
    ...reference,
    score("at-p50", "q1", "project"),
    score("at-p50", "q2", "project"),
    score("over-p50", "q1", "project"),
    score("over-p50", "q2", "project"),
  ];
  const summaries = summarize([...passResults, ...failResults], scores, []);
  const atP50 = summaries.find((s) => s.variant === "at-p50");
  const overP50 = summaries.find((s) => s.variant === "over-p50");
  assert.ok(atP50 && overP50);
  assert.ok(!atP50.failedCriteria.includes("ttft_p50"));
  assert.ok(overP50.failedCriteria.includes("ttft_p50"));
});

void test("threshold boundaries: decode_p50 at 40 passes, below fails", () => {
  const passResults: ResultRow[] = [
    {
      variant: "at-decode",
      pass: "baseline",
      itemId: "q1",
      rep: 1,
      ok: true,
      decodeTokensPerSecond: 40,
    },
    {
      variant: "at-decode",
      pass: "baseline",
      itemId: "q2",
      rep: 1,
      ok: true,
      decodeTokensPerSecond: 40,
    },
  ];
  const failResults: ResultRow[] = [
    {
      variant: "under-decode",
      pass: "baseline",
      itemId: "q1",
      rep: 1,
      ok: true,
      decodeTokensPerSecond: 39.9,
    },
    {
      variant: "under-decode",
      pass: "baseline",
      itemId: "q2",
      rep: 1,
      ok: true,
      decodeTokensPerSecond: 39.9,
    },
  ];
  const scores = [
    ...reference,
    score("at-decode", "q1", "project"),
    score("at-decode", "q2", "project"),
    score("under-decode", "q1", "project"),
    score("under-decode", "q2", "project"),
  ];
  const summaries = summarize([...passResults, ...failResults], scores, []);
  const atDecode = summaries.find((s) => s.variant === "at-decode");
  const underDecode = summaries.find((s) => s.variant === "under-decode");
  assert.ok(atDecode && underDecode);
  assert.ok(!atDecode.failedCriteria.includes("decode_p50"));
  assert.ok(underDecode.failedCriteria.includes("decode_p50"));
});

void test("threshold boundaries: refusal at 0.9 (9/10) passes, below (8/10) fails", () => {
  const passResults: ResultRow[] = [...speedRows("good-refusal", 800, 60)];
  const failResults: ResultRow[] = [...speedRows("bad-refusal", 800, 60)];

  // 9/10 out_of_scope items refused = 0.9 (exactly at threshold, should pass)
  const passScores = [...reference, score("good-refusal", "q1", "project")];
  for (let i = 0; i < 9; i++) {
    passScores.push(
      score("good-refusal", `oos${i}`, "out_of_scope", { refused: true }),
    );
  }

  // 8/10 out_of_scope items refused = 0.8 (below threshold, should fail)
  const failScores = [...reference, score("bad-refusal", "q1", "project")];
  for (let i = 0; i < 8; i++) {
    failScores.push(
      score("bad-refusal", `oos${i}`, "out_of_scope", { refused: true }),
    );
  }
  for (let i = 8; i < 10; i++) {
    failScores.push(
      score("bad-refusal", `oos${i}`, "out_of_scope", { refused: false }),
    );
  }

  const summaries = summarize(
    [...passResults, ...failResults],
    [...passScores, ...failScores],
    [],
  );
  const goodRefusal = summaries.find((s) => s.variant === "good-refusal");
  const badRefusal = summaries.find((s) => s.variant === "bad-refusal");
  assert.ok(goodRefusal && badRefusal);
  assert.ok(!goodRefusal.failedCriteria.includes("refusal"));
  assert.ok(badRefusal.failedCriteria.includes("refusal"));
});

void test("threshold boundaries: format at 0.9 (9/10) passes, below (8/10) fails", () => {
  const passResults: ResultRow[] = [...speedRows("good-format", 800, 60)];
  const failResults: ResultRow[] = [...speedRows("bad-format", 800, 60)];

  // 9/10 items format_ok = 0.9 (exactly at threshold, should pass)
  const passScores = [...reference];
  for (let i = 0; i < 9; i++) {
    passScores.push(
      score("good-format", `q${i}`, "project", { format_ok: true }),
    );
  }
  passScores.push(score("good-format", "q9", "project", { format_ok: false }));

  // 8/10 items format_ok = 0.8 (below threshold, should fail)
  const failScores = [...reference];
  for (let i = 0; i < 8; i++) {
    failScores.push(
      score("bad-format", `q${i}`, "project", { format_ok: true }),
    );
  }
  for (let i = 8; i < 10; i++) {
    failScores.push(
      score("bad-format", `q${i}`, "project", { format_ok: false }),
    );
  }

  const summaries = summarize(
    [...passResults, ...failResults],
    [...passScores, ...failScores],
    [],
  );
  const goodFormat = summaries.find((s) => s.variant === "good-format");
  const badFormat = summaries.find((s) => s.variant === "bad-format");
  assert.ok(goodFormat && badFormat);
  assert.ok(!goodFormat.failedCriteria.includes("format"));
  assert.ok(badFormat.failedCriteria.includes("format"));
});

void test("threshold boundaries: quality ratio at 0.9 passes, below fails", () => {
  const results: ResultRow[] = [
    ...speedRows("at-quality", 800, 60),
    ...speedRows("under-quality", 800, 60),
  ];
  // Reference: q1=5, q2=5 (mean=5 for both items)
  // At-quality variant: q1=4.5, q2=4.5 (common q1: mean=4.5/5=0.9, exactly at threshold)
  // Under-quality variant: q1=4.4, q2=4.4 (common q1: mean=4.4/5=0.88, below threshold)
  const scores = [
    score("gpt-6-luna", "q1", "project", { correctness: 5 }),
    score("gpt-6-luna", "q2", "out_of_scope", { correctness: 5 }),
    score("at-quality", "q1", "project", { correctness: 4.5 }),
    score("at-quality", "q2", "out_of_scope", { correctness: 4.5 }),
    score("under-quality", "q1", "project", { correctness: 4.4 }),
    score("under-quality", "q2", "out_of_scope", {
      correctness: 4.4,
      judgeError: "failed",
    }),
  ];
  const summaries = summarize(results, scores, []);
  const atQuality = summaries.find((s) => s.variant === "at-quality");
  const underQuality = summaries.find((s) => s.variant === "under-quality");
  assert.ok(atQuality && underQuality);
  assert.equal(atQuality.qualityRatio, 0.9);
  assert.ok(!atQuality.failedCriteria.includes("quality"));
  assert.ok(underQuality.failedCriteria.includes("quality"));
});

void test("variant with scores but no result rows fails TTFT and decode", () => {
  const results: ResultRow[] = [...speedRows("has-scores", 800, 60)];
  const scores = [
    ...reference,
    score("no-results", "q1", "project"),
    score("no-results", "q2", "out_of_scope"),
    score("has-scores", "q1", "project"),
    score("has-scores", "q2", "out_of_scope"),
  ];
  const summaries = summarize(results, scores, []);
  const noResults = summaries.find((s) => s.variant === "no-results");
  assert.ok(noResults);
  assert.ok(noResults.failedCriteria.includes("ttft_p50"));
  assert.ok(noResults.failedCriteria.includes("ttft_p95"));
  assert.ok(noResults.failedCriteria.includes("decode_p50"));
});

void test("variant with result rows but no scores fails refusal, quality, format", () => {
  const results: ResultRow[] = [
    ...speedRows("has-results", 800, 60),
    ...speedRows("no-scores", 800, 60),
  ];
  const scores = [
    ...reference,
    score("has-results", "q1", "project"),
    score("has-results", "q2", "out_of_scope"),
  ];
  const summaries = summarize(results, scores, []);
  const noScores = summaries.find((s) => s.variant === "no-scores");
  assert.ok(noScores);
  assert.ok(noScores.failedCriteria.includes("refusal"));
  assert.ok(noScores.failedCriteria.includes("quality"));
  assert.ok(noScores.failedCriteria.includes("format"));
});
