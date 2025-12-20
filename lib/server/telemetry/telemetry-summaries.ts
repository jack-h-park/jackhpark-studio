export type SafeTraceInputSummary = {
  intent: string | null;
  model: string | null;
  topK: number | null;
  history_window: number | null;
  question_length: number | null;
  settings_hash: string | null;
};

export type SafeTraceOutputSummary = {
  answer_chars: number;
  citationsCount: number | null;
  cache_hit: boolean | null;
  insufficient: boolean | null;
  finish_reason: "success" | "error" | "aborted";
  error_category: string | null;
};

const normalizeNumber = (value: number | null | undefined): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
};

const normalizeString = (value: string | null | undefined): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
};

export function buildSafeTraceInputSummary(args: {
  intent?: string | null;
  model?: string | null;
  topK?: number | null;
  historyWindowTokens?: number | null;
  questionLength?: number | null;
  settingsHash?: string | null;
}): SafeTraceInputSummary {
  return {
    intent: normalizeString(args.intent),
    model: normalizeString(args.model),
    topK: normalizeNumber(args.topK),
    history_window: normalizeNumber(args.historyWindowTokens),
    question_length: normalizeNumber(args.questionLength),
    settings_hash: normalizeString(args.settingsHash),
  };
}

export function buildSafeTraceOutputSummary(args: {
  answerChars?: number | null;
  citationsCount?: number | null;
  cacheHit?: boolean | null;
  insufficient?: boolean | null;
  finishReason: SafeTraceOutputSummary["finish_reason"];
  errorCategory?: string | null;
}): SafeTraceOutputSummary {
  return {
    answer_chars: Math.max(0, normalizeNumber(args.answerChars) ?? 0),
    citationsCount:
      typeof args.citationsCount === "number" && args.citationsCount >= 0
        ? args.citationsCount
        : null,
    cache_hit: typeof args.cacheHit === "boolean" ? args.cacheHit : null,
    insufficient:
      typeof args.insufficient === "boolean" ? args.insufficient : null,
    finish_reason: args.finishReason,
    error_category: normalizeString(args.errorCategory),
  };
}

export function mergeSafeTraceInputSummary(
  prev: SafeTraceInputSummary | null,
  next: SafeTraceInputSummary,
): SafeTraceInputSummary {
  if (!prev) {
    return { ...next };
  }
  return {
    intent: prev.intent ?? next.intent,
    model: prev.model ?? next.model,
    topK:
      prev.topK == null
        ? next.topK
        : Math.max(prev.topK, next.topK ?? prev.topK),
    history_window:
      prev.history_window == null
        ? next.history_window
        : Math.max(
            prev.history_window,
            next.history_window ?? prev.history_window,
          ),
    question_length:
      prev.question_length == null
        ? next.question_length
        : Math.max(
            prev.question_length,
            next.question_length ?? prev.question_length,
          ),
    settings_hash: prev.settings_hash ?? next.settings_hash,
  };
}

export function mergeSafeTraceOutputSummary(
  prev: SafeTraceOutputSummary | null,
  next: SafeTraceOutputSummary,
): SafeTraceOutputSummary {
  // ─────────────────────────────────────────────────────────────
  // Telemetry semantic invariant (do not change casually)
  // See: docs/telemetry/telemetry-audit-checklist.md
  // Invariant: citationsCount is final-only and must not be overwritten by interim zeros.
  // ─────────────────────────────────────────────────────────────
  if (!prev) {
    return { ...next };
  }
  // citationsCount is final-only: do not overwrite a real count with an interim 0.
  const citationsCount =
    typeof next.citationsCount === "number"
      ? next.citationsCount
      : prev.citationsCount;
  return {
    answer_chars: Math.max(prev.answer_chars, next.answer_chars),
    citationsCount:
      citationsCount === 0 && (prev.citationsCount ?? 0) > 0
        ? prev.citationsCount
        : (citationsCount ?? null),
    cache_hit:
      prev.cache_hit === true || next.cache_hit === true
        ? true
        : prev.cache_hit === false || next.cache_hit === false
          ? false
          : null,
    insufficient:
      typeof next.insufficient === "boolean"
        ? next.insufficient
        : prev.insufficient,
    finish_reason: next.finish_reason,
    error_category: next.error_category ?? prev.error_category,
  };
}
