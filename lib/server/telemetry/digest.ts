// Score names this digest understands. Kept as literals (mirroring the names
// emitted in langfuse-scores.ts — `user_feedback` matches USER_FEEDBACK_SCORE_NAME)
// so the digest stays decoupled from the emission code.
export const DIGEST_SCORE_NAMES = {
  retrievalHighestScore: "retrieval_highest_score",
  retrievalInsufficient: "retrieval_insufficient",
  contextUniqueDocs: "context_unique_docs",
  userFeedback: "user_feedback",
} as const;

/** Minimal shape of a Langfuse score the digest consumes. */
export type DigestScore = {
  name: string;
  value: number | null;
  traceId?: string | null;
  timestamp?: string | null;
  comment?: string | null;
};

export type NumericStat = {
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
};

export type RateStat = {
  count: number;
  /** Mean of the 0/1 values, i.e. the fraction that are 1. Null when count=0. */
  rate: number | null;
  positives: number;
};

/**
 * Cross-tab of retrieval sufficiency (proxy signal) against real user
 * satisfaction (👍/👎). The off-diagonal cells are the point of P1: they show
 * where the proxy and the human disagree.
 */
export type DivergenceBuckets = {
  joinable: number; // traces carrying BOTH a feedback and an insufficient score
  alignedGood: number; // sufficient + 👍
  alignedBad: number; // insufficient + 👎
  insufficientButSatisfied: number; // insufficient + 👍 → proxy too strict / model recovered
  sufficientButDissatisfied: number; // sufficient + 👎 → quality issue beyond retrieval
};

export type WeeklyDigest = {
  window: { from: string; to: string };
  totalScores: number;
  distinctTraces: number;
  retrievalHighestScore: NumericStat;
  retrievalInsufficient: RateStat;
  contextUniqueDocs: NumericStat;
  userFeedback: {
    stat: RateStat;
    up: number;
    down: number;
    comments: { value: "up" | "down"; comment: string }[];
  };
  divergence: DivergenceBuckets;
  flags: string[];
};

/**
 * Product-analytics metrics from PostHog `chat_completion` events. Optional —
 * only available when a PostHog personal API key is configured (the repo's
 * phc_ capture key cannot query). Sourced separately from the Langfuse scores.
 */
export type PostHogMetrics = {
  requests: number;
  distinctUsers: number;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  errorRate: number | null;
  responseCacheHitRate: number | null;
  abortRate: number | null;
  avgTokens: number | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numericStat(values: number[]): NumericStat {
  if (values.length === 0) {
    return { count: 0, avg: null, min: null, max: null };
  }
  const sum = values.reduce((acc, v) => acc + v, 0);
  return {
    count: values.length,
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function rateStat(values: number[]): RateStat {
  if (values.length === 0) {
    return { count: 0, rate: null, positives: 0 };
  }
  const positives = values.filter((v) => v === 1).length;
  return { count: values.length, rate: positives / values.length, positives };
}

/**
 * Last-write-wins per trace for a given score name. A user can click 👍 then
 * 👎; the most recent timestamp is the one that counts.
 */
function latestByTrace(scores: DigestScore[]): Map<string, DigestScore> {
  const byTrace = new Map<string, DigestScore>();
  for (const score of scores) {
    if (!score.traceId) {
      continue;
    }
    const existing = byTrace.get(score.traceId);
    if (!existing) {
      byTrace.set(score.traceId, score);
      continue;
    }
    const a = existing.timestamp ?? "";
    const b = score.timestamp ?? "";
    if (b >= a) {
      byTrace.set(score.traceId, score);
    }
  }
  return byTrace;
}

export function computeWeeklyDigest(
  scores: DigestScore[],
  window: { from: string; to: string },
): WeeklyDigest {
  const byName = (name: string) => scores.filter((s) => s.name === name);

  const highest = byName(DIGEST_SCORE_NAMES.retrievalHighestScore)
    .map((s) => s.value)
    .filter(isFiniteNumber);
  const insufficient = byName(DIGEST_SCORE_NAMES.retrievalInsufficient)
    .map((s) => s.value)
    .filter(isFiniteNumber);
  const uniqueDocs = byName(DIGEST_SCORE_NAMES.contextUniqueDocs)
    .map((s) => s.value)
    .filter(isFiniteNumber);

  const feedbackScores = byName(DIGEST_SCORE_NAMES.userFeedback);
  const feedbackValues = feedbackScores
    .map((s) => s.value)
    .filter(isFiniteNumber);
  const up = feedbackValues.filter((v) => v === 1).length;
  const down = feedbackValues.filter((v) => v === 0).length;
  const comments = feedbackScores
    .filter((s) => typeof s.comment === "string" && s.comment.trim().length > 0)
    .map((s) => ({
      value: (s.value === 1 ? "up" : "down") as "up" | "down",
      comment: (s.comment as string).trim(),
    }));

  // Divergence: join the latest feedback and latest insufficient per trace.
  const feedbackByTrace = latestByTrace(feedbackScores);
  const insufficientByTrace = latestByTrace(
    byName(DIGEST_SCORE_NAMES.retrievalInsufficient),
  );
  const divergence: DivergenceBuckets = {
    joinable: 0,
    alignedGood: 0,
    alignedBad: 0,
    insufficientButSatisfied: 0,
    sufficientButDissatisfied: 0,
  };
  for (const [traceId, feedback] of feedbackByTrace) {
    const insuf = insufficientByTrace.get(traceId);
    if (!insuf || !isFiniteNumber(insuf.value) || !isFiniteNumber(feedback.value)) {
      continue;
    }
    divergence.joinable += 1;
    const satisfied = feedback.value === 1;
    const wasInsufficient = insuf.value === 1;
    if (!wasInsufficient && satisfied) divergence.alignedGood += 1;
    else if (wasInsufficient && !satisfied) divergence.alignedBad += 1;
    else if (wasInsufficient && satisfied)
      divergence.insufficientButSatisfied += 1;
    else divergence.sufficientButDissatisfied += 1;
  }

  const distinctTraces = new Set(
    scores.map((s) => s.traceId).filter(Boolean),
  ).size;

  const userFeedbackStat = rateStat(feedbackValues);
  const insufficientStat = rateStat(insufficient);

  // Rule-based takeaways. Deterministic and reproducible — no LLM, no guessing.
  const flags: string[] = [];
  if (userFeedbackStat.rate !== null && userFeedbackStat.count >= 5) {
    if (userFeedbackStat.rate < 0.8) {
      flags.push(
        `Satisfaction ${(userFeedbackStat.rate * 100).toFixed(0)}% is below the 80% target (n=${userFeedbackStat.count}).`,
      );
    }
  }
  if (divergence.sufficientButDissatisfied > 0) {
    flags.push(
      `${divergence.sufficientButDissatisfied} trace(s) had sufficient retrieval but 👎 — investigate generation/answer quality, not retrieval.`,
    );
  }
  if (divergence.insufficientButSatisfied > 0) {
    flags.push(
      `${divergence.insufficientButSatisfied} trace(s) were flagged insufficient yet got 👍 — the insufficient proxy may be too strict.`,
    );
  }
  if (insufficientStat.rate !== null && insufficientStat.rate > 0.3) {
    flags.push(
      `Retrieval insufficient on ${(insufficientStat.rate * 100).toFixed(0)}% of knowledge traces — consider raising topK or revisiting ranking weights.`,
    );
  }
  if (userFeedbackStat.count === 0) {
    flags.push("No user feedback collected this period — 👍/👎 adoption is zero.");
  }

  return {
    window,
    totalScores: scores.length,
    distinctTraces,
    retrievalHighestScore: numericStat(highest),
    retrievalInsufficient: insufficientStat,
    contextUniqueDocs: numericStat(uniqueDocs),
    userFeedback: { stat: userFeedbackStat, up, down, comments },
    divergence,
    flags,
  };
}

function fmtRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(0)}%`;
}

function fmtNum(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

function fmtMs(ms: number | null): string {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

/** Rule-based flags derived from PostHog product metrics (knowledge traffic). */
function posthogFlags(p: PostHogMetrics): string[] {
  const flags: string[] = [];
  if (p.requests >= 30 && p.latencyP99Ms !== null && p.latencyP99Ms > 24_000) {
    flags.push(
      `Latency p99 is ${fmtMs(p.latencyP99Ms)} (> 24s prod SLO) over ${p.requests} requests — investigate the tail.`,
    );
  }
  if (p.errorRate !== null && p.errorRate > 0.05 && p.requests >= 20) {
    flags.push(
      `Error rate ${fmtRate(p.errorRate)} exceeds 5% (n=${p.requests}).`,
    );
  }
  return flags;
}

export function renderWeeklyDigestMarkdown(
  d: WeeklyDigest,
  posthog?: PostHogMetrics | null,
): string {
  const fb = d.userFeedback;
  const div = d.divergence;

  const posthogSection: string[] = posthog
    ? [
        `## Product metrics (PostHog)`,
        "",
        `| Metric | Value |`,
        `| --- | --- |`,
        `| Chat requests | ${posthog.requests} |`,
        `| Distinct users | ${posthog.distinctUsers} |`,
        `| Latency p50 / p95 / p99 | ${fmtMs(posthog.latencyP50Ms)} / ${fmtMs(posthog.latencyP95Ms)} / ${fmtMs(posthog.latencyP99Ms)} |`,
        `| Error rate | ${fmtRate(posthog.errorRate)} |`,
        `| Abort rate | ${fmtRate(posthog.abortRate)} |`,
        `| Response cache hit rate | ${fmtRate(posthog.responseCacheHitRate)} |`,
        `| Avg tokens / request | ${fmtNum(posthog.avgTokens, 0)} |`,
        "",
      ]
    : [];

  const allFlags = [...d.flags, ...(posthog ? posthogFlags(posthog) : [])];

  const divergenceSection =
    div.joinable === 0
      ? [
          `No traces carried both a feedback and an insufficient score this period, so proxy/human agreement can't be measured yet.`,
        ]
      : [
          `Joinable traces (have both signals): **${div.joinable}**`,
          "",
          `| | 👍 satisfied | 👎 dissatisfied |`,
          `| --- | --- | --- |`,
          `| **sufficient** | ${div.alignedGood} | ${div.sufficientButDissatisfied} |`,
          `| **insufficient** | ${div.insufficientButSatisfied} | ${div.alignedBad} |`,
        ];

  const commentsSection =
    fb.comments.length === 0
      ? []
      : [
          `## Feedback comments`,
          "",
          ...fb.comments.map(
            (c) => `- ${c.value === "up" ? "👍" : "👎"} ${c.comment}`,
          ),
          "",
        ];

  const takeawaysSection =
    allFlags.length === 0
      ? [`- No threshold breaches this period. Metrics within range.`]
      : allFlags.map((flag) => `- ${flag}`);

  const sections: string[] = [
    `# Weekly telemetry digest`,
    "",
    `**Window:** ${d.window.from} → ${d.window.to}`,
    `**Volume:** ${d.distinctTraces} traces scored, ${d.totalScores} scores total`,
    "",
    ...posthogSection,
    `## User satisfaction (👍/👎)`,
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Responses rated | ${fb.stat.count} |`,
    `| 👍 up | ${fb.up} |`,
    `| 👎 down | ${fb.down} |`,
    `| Satisfaction rate | ${fmtRate(fb.stat.rate)} |`,
    "",
    `## Retrieval quality`,
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Highest similarity (avg) | ${fmtNum(d.retrievalHighestScore.avg)} (min ${fmtNum(d.retrievalHighestScore.min)}, max ${fmtNum(d.retrievalHighestScore.max)}, n=${d.retrievalHighestScore.count}) |`,
    `| Insufficient rate | ${fmtRate(d.retrievalInsufficient.rate)} (${d.retrievalInsufficient.positives}/${d.retrievalInsufficient.count}) |`,
    `| Unique docs in context (avg) | ${fmtNum(d.contextUniqueDocs.avg, 1)} (n=${d.contextUniqueDocs.count}) |`,
    "",
    `## Proxy vs. human (divergence)`,
    "",
    ...divergenceSection,
    "",
    ...commentsSection,
    `## Takeaways`,
    "",
    ...takeawaysSection,
    "",
  ];

  return sections.join("\n");
}
