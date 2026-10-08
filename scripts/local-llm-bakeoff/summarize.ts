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
): VariantSummary[] {
  const validScores = scores.filter((s) => s.judgeError === undefined);
  const referenceMean = mean(
    numbers(
      validScores
        .filter((s) => s.variant === REFERENCE_VARIANT)
        .map((s) => s.correctness),
    ),
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
    const meanCorrectness = mean(numbers(own.map((s) => s.correctness)));
    const memoryDeltaGb =
      typeof memory?.deltaBytes === "number" ? memory.deltaBytes / GB : null;

    const summary: VariantSummary = {
      variant,
      requests: baseline.length,
      errors: baseline.length - okBaseline.length,
      ttftP50Ms: percentile(numbers(okBaseline.map((r) => r.ttftMs)), 50),
      ttftP95Ms: percentile(numbers(okBaseline.map((r) => r.ttftMs)), 95),
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
      judgeErrors: scores.filter(
        (s) => s.variant === variant && s.judgeError !== undefined,
      ).length,
      meanCorrectness,
      qualityRatio:
        meanCorrectness !== null && referenceMean
          ? meanCorrectness / referenceMean
          : null,
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
        "ttft_p50",
        summary.ttftP50Ms === null || summary.ttftP50Ms > GATE.ttftP50Ms,
      ],
      [
        "ttft_p95",
        summary.ttftP95Ms === null || summary.ttftP95Ms > GATE.ttftP95Ms,
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
        : pendingReview > 0
          ? "pending-review"
          : "pass";
    return summary;
  });
}

function fmt(value: number | null, digits = 0): string {
  return value === null ? "—" : value.toFixed(digits);
}

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function renderReport(summaries: VariantSummary[]): string {
  const header =
    "| Variant | Gate | TTFT p50 ms | TTFT p95 ms | Decode p50 tok/s | Quality ratio | Refusal | Over-refusal | Format | Language | Ungrounded (confirmed/pending) | Concurrent TTFT p95 ms | Memory Δ GB | Fits 40/20 GB | Errors |";
  const divider = `|${" --- |".repeat(15)}`;
  const rows = summaries.map((s) =>
    [
      s.variant,
      s.gate,
      fmt(s.ttftP50Ms),
      fmt(s.ttftP95Ms),
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
