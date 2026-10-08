export const REFERENCE_VARIANT = "gpt-6-luna";

export const GATE = {
  ttftP50Ms: 1500,
  ttftP95Ms: 3000,
  decodeP50: 40,
  refusalMin: 0.9,
  qualityRatioMin: 0.9,
  formatMin: 0.9,
} as const;

const GB = 1e9;

export type ResultRow = {
  variant: string;
  pass: string;
  itemId: string;
  rep: number;
  ok?: boolean;
  ttftMs?: number | null;
  decodeTokensPerSecond?: number | null;
  deltaBytes?: number;
  error?: string;
};

export type ScoreRow = {
  variant: string;
  itemId: string;
  kind?: string;
  grounded?: boolean;
  ungrounded_claims?: string[];
  correctness?: number;
  refused?: boolean;
  format_ok?: boolean;
  language_match?: boolean;
  judgeError?: string;
};

export type Review = {
  variant: string;
  itemId: string;
  confirmedUngrounded: boolean;
};

export type VariantSummary = {
  variant: string;
  /** Fixture items with a baseline row and a valid score, e.g. "38/40"; "—" without fixture ids. */
  coverage: string;
  requests: number;
  errors: number;
  ttftP50Ms: number | null;
  ttftP95Ms: number | null;
  decodeP50: number | null;
  concurrentTtftP95Ms: number | null;
  memoryDeltaGb: number | null;
  fits40Gb: boolean | null;
  fits20Gb: boolean | null;
  scored: number;
  judgeErrors: number;
  meanCorrectness: number | null;
  qualityRatio: number | null;
  refusalCorrectRate: number | null;
  overRefusalRate: number | null;
  formatRate: number | null;
  languageMatchRate: number | null;
  flaggedUngrounded: string[];
  confirmedUngrounded: number;
  pendingReview: number;
  gate: "pass" | "fail" | "pending-review" | "reference";
  failedCriteria: string[];
};

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? null;
}

function mean(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function ttftValues(baseline: ResultRow[]): number[] {
  return baseline.map((r) => {
    if (r.ok !== true || typeof r.ttftMs !== "number") {
      return Number.POSITIVE_INFINITY;
    }
    return r.ttftMs;
  });
}

function rate<T>(rows: T[], predicate: (row: T) => boolean): number | null {
  return rows.length === 0 ? null : rows.filter(predicate).length / rows.length;
}

function numbers(values: (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => typeof v === "number");
}

export function summarize(
  results: ResultRow[],
  scores: ScoreRow[],
  reviews: Review[],
  fixtureItemIds?: string[],
): VariantSummary[] {
  return summarizeLatest(
    results,
    latestScores(scores),
    reviews,
    fixtureItemIds,
  );
}

/**
 * score.ts appends a retry after a judge error rather than rewriting the file,
 * so the last row per variant|itemId is the current one.
 */
function latestScores(scores: ScoreRow[]): ScoreRow[] {
  const latest = new Map<string, ScoreRow>();
  for (const row of scores) {
    const key = `${row.variant}|${row.itemId}`;
    latest.delete(key);
    latest.set(key, row);
  }
  return [...latest.values()];
}

function summarizeLatest(
  results: ResultRow[],
  scores: ScoreRow[],
  reviews: Review[],
  fixtureItemIds: string[] | undefined,
): VariantSummary[] {
  const validScores = scores.filter((s) => s.judgeError === undefined);
  const referenceScores = validScores.filter(
    (s) => s.variant === REFERENCE_VARIANT,
  );
  const variants = [
    ...new Set([
      ...results.map((r) => r.variant),
      ...scores.map((s) => s.variant),
    ]),
  ].toSorted((a, b) =>
    a === REFERENCE_VARIANT
      ? 1
      : b === REFERENCE_VARIANT
        ? -1
        : a.localeCompare(b),
  );

  return variants.map((variant) => {
    const baseline = results.filter(
      (r) => r.variant === variant && r.pass === "baseline",
    );
    const okBaseline = baseline.filter((r) => r.ok === true);
    const concurrent = results.filter(
      (r) => r.variant === variant && r.pass === "concurrent" && r.ok === true,
    );
    const memory = results.find(
      (r) => r.variant === variant && r.pass === "memory",
    );
    const own = validScores.filter((s) => s.variant === variant);
    const allOwn = scores.filter((s) => s.variant === variant);
    const outOfScope = own.filter((s) => s.kind === "out_of_scope");
    const inScope = own.filter((s) => s.kind !== "out_of_scope");
    const flagged = own
      .filter((s) => s.grounded === false)
      .map((s) => s.itemId);
    const reviewFor = (itemId: string) =>
      reviews.find((r) => r.variant === variant && r.itemId === itemId);
    const confirmed = flagged.filter(
      (itemId) => reviewFor(itemId)?.confirmedUngrounded === true,
    ).length;
    const pendingReview = flagged.filter(
      (itemId) => reviewFor(itemId) === undefined,
    ).length;

    // Quality ratio: only items both variants scored without judgeError
    let qualityRatio: number | null = null;
    if (variant !== REFERENCE_VARIANT && referenceScores.length > 0) {
      const referenceItemIds = new Set(referenceScores.map((s) => s.itemId));
      const ownCommon = own.filter((s) => referenceItemIds.has(s.itemId));
      const referenceCommon = referenceScores.filter((s) =>
        ownCommon.some((o) => o.itemId === s.itemId),
      );
      if (ownCommon.length > 0 && referenceCommon.length > 0) {
        const ownMean = mean(numbers(ownCommon.map((s) => s.correctness)));
        const refMean = mean(
          numbers(referenceCommon.map((s) => s.correctness)),
        );
        if (ownMean !== null && refMean !== null && refMean > 0) {
          qualityRatio = ownMean / refMean;
        }
      }
    }

    const meanCorrectness = mean(numbers(own.map((s) => s.correctness)));
    const memoryDeltaGb =
      typeof memory?.deltaBytes === "number" ? memory.deltaBytes / GB : null;
    const judgeErrors = allOwn.filter((s) => s.judgeError !== undefined).length;

    // Every fixture item needs a baseline row and a valid score, or the gate
    // would be decided on whichever items happened to finish.
    const measuredIds = new Set(baseline.map((r) => r.itemId));
    const scoredIds = new Set(own.map((s) => s.itemId));
    const coveredCount = fixtureItemIds?.filter(
      (itemId) => measuredIds.has(itemId) && scoredIds.has(itemId),
    ).length;

    const summary: VariantSummary = {
      variant,
      coverage:
        fixtureItemIds === undefined
          ? "—"
          : `${coveredCount ?? 0}/${fixtureItemIds.length}`,
      requests: baseline.length,
      errors: baseline.length - okBaseline.length,
      ttftP50Ms: percentile(ttftValues(baseline), 50),
      ttftP95Ms: percentile(ttftValues(baseline), 95),
      decodeP50: percentile(
        numbers(okBaseline.map((r) => r.decodeTokensPerSecond)),
        50,
      ),
      concurrentTtftP95Ms: percentile(
        numbers(concurrent.map((r) => r.ttftMs)),
        95,
      ),
      memoryDeltaGb,
      fits40Gb: memoryDeltaGb === null ? null : memoryDeltaGb <= 40,
      fits20Gb: memoryDeltaGb === null ? null : memoryDeltaGb <= 20,
      scored: own.length,
      judgeErrors,
      meanCorrectness,
      qualityRatio,
      refusalCorrectRate: rate(outOfScope, (s) => s.refused === true),
      overRefusalRate: rate(inScope, (s) => s.refused === true),
      formatRate: rate(own, (s) => s.format_ok === true),
      languageMatchRate: rate(own, (s) => s.language_match === true),
      flaggedUngrounded: flagged,
      confirmedUngrounded: confirmed,
      pendingReview,
      gate: "reference",
      failedCriteria: [],
    };
    if (variant === REFERENCE_VARIANT) {
      return summary;
    }
    // A missing measurement fails its criterion: an unmeasured variant never passes.
    const checks: [string, boolean][] = [
      [
        "coverage",
        fixtureItemIds !== undefined && coveredCount !== fixtureItemIds.length,
      ],
      [
        "ttft_p50",
        summary.ttftP50Ms === null ||
          !Number.isFinite(summary.ttftP50Ms) ||
          summary.ttftP50Ms > GATE.ttftP50Ms,
      ],
      [
        "ttft_p95",
        summary.ttftP95Ms === null ||
          !Number.isFinite(summary.ttftP95Ms) ||
          summary.ttftP95Ms > GATE.ttftP95Ms,
      ],
      [
        "decode_p50",
        summary.decodeP50 === null || summary.decodeP50 < GATE.decodeP50,
      ],
      ["groundedness", confirmed > 0],
      [
        "refusal",
        summary.refusalCorrectRate === null ||
          summary.refusalCorrectRate < GATE.refusalMin,
      ],
      [
        "quality",
        summary.qualityRatio === null ||
          summary.qualityRatio < GATE.qualityRatioMin,
      ],
      [
        "format",
        summary.formatRate === null || summary.formatRate < GATE.formatMin,
      ],
    ];
    const failed = checks
      .filter(([, failing]) => failing)
      .map(([name]) => name);
    summary.failedCriteria = failed;
    summary.gate =
      failed.length > 0
        ? "fail"
        : judgeErrors > 0 || pendingReview > 0
          ? "pending-review"
          : "pass";
    return summary;
  });
}

function fmt(value: number | null, digits = 0): string {
  if (value === null) {
    return "—";
  }
  if (!Number.isFinite(value)) {
    return "∞";
  }
  return value.toFixed(digits);
}

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function renderReport(summaries: VariantSummary[]): string {
  const header =
    "| Variant | Gate | Coverage | TTFT p50 ms | TTFT p95 ms | Decode p50 tok/s | Quality ratio | Refusal | Over-refusal | Format | Language | Ungrounded (confirmed/pending) | Concurrent TTFT p95 ms | Memory Δ GB | Fits 40/20 GB | Errors |";
  const divider = `|${" --- |".repeat(16)}`;
  // Reference rows are recorded through the app, which reports no TTFT.
  const ttft = (s: VariantSummary, value: number | null) =>
    s.gate === "reference" ? "n/a (app)" : fmt(value);
  const rows = summaries.map((s) =>
    [
      s.variant,
      s.gate,
      s.coverage,
      ttft(s, s.ttftP50Ms),
      ttft(s, s.ttftP95Ms),
      fmt(s.decodeP50, 1),
      fmt(s.qualityRatio, 2),
      pct(s.refusalCorrectRate),
      pct(s.overRefusalRate),
      pct(s.formatRate),
      pct(s.languageMatchRate),
      `${s.confirmedUngrounded}/${s.pendingReview}`,
      fmt(s.concurrentTtftP95Ms),
      fmt(s.memoryDeltaGb, 1),
      s.fits40Gb === null
        ? "—"
        : `${s.fits40Gb ? "yes" : "no"}/${s.fits20Gb ? "yes" : "no"}`,
      `${s.errors} run, ${s.judgeErrors} judge`,
    ].join(" | "),
  );
  const details = summaries
    .filter(
      (s) => s.failedCriteria.length > 0 || s.flaggedUngrounded.length > 0,
    )
    .map(
      (s) =>
        `- **${s.variant}**: failed ${s.failedCriteria.join(", ") || "nothing"}; flagged ungrounded items ${s.flaggedUngrounded.join(", ") || "none"}`,
    );
  return [
    "# Local LLM bake-off report",
    "",
    `Gate: TTFT p50 ≤ ${GATE.ttftP50Ms} ms, p95 ≤ ${GATE.ttftP95Ms} ms; decode p50 ≥ ${GATE.decodeP50} tok/s; zero confirmed ungrounded claims; refusal ≥ ${pct(GATE.refusalMin)}; quality ratio ≥ ${GATE.qualityRatioMin}; format ≥ ${pct(GATE.formatMin)}. Memory Δ is approximate (system-wide vm_stat).`,
    "",
    header,
    divider,
    ...rows.map((row) => `| ${row} |`),
    "",
    ...(details.length > 0 ? ["## Details", "", ...details, ""] : []),
  ].join("\n");
}
