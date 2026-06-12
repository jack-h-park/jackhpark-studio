/**
 * Analysis definitions as code — the version-controlled source of truth for
 * PostHog insights and Langfuse score configs. Keeping these in the repo (vs.
 * UI-only) makes them reviewable, reproducible, and recreatable, and keeps the
 * dashboard definitions in lockstep with the event/score schema the app emits.
 *
 * Synced by scripts/telemetry/sync-analytics.ts (`pnpm telemetry:sync`).
 */

/** Marks an insight as managed by this file, for idempotent sync + grouping. */
export const MANAGED_INSIGHT_TAG = "as-code";

/** Prefix on managed insight names so the sync can match them unambiguously. */
export const MANAGED_INSIGHT_PREFIX = "[as-code]";

/** The managed dashboard all insights are attached to (matched by name). */
export const MANAGED_DASHBOARD = {
  name: `${MANAGED_INSIGHT_PREFIX} Chat telemetry`,
  description:
    "Managed by `pnpm telemetry:sync`. Edit definitions in lib/server/telemetry/analytics-definitions.ts — UI edits are overwritten on next sync.",
} as const;

export type PostHogInsightDef = {
  /** Stable name (without prefix); the sync prepends MANAGED_INSIGHT_PREFIX. */
  name: string;
  description: string;
  /** HogQL returning a time series (first column a day bucket). */
  hogql: string;
};

// Knowledge traffic is identified by rag_enabled (PostHog has no `intent`
// filter) — see docs/canonical/telemetry/alerting-contract.md.
const KNOWLEDGE = "event = 'chat_completion' AND properties.rag_enabled";
const WINDOW = "timestamp > now() - toIntervalDay(30)";

export const POSTHOG_INSIGHTS: PostHogInsightDef[] = [
  {
    name: "Chat latency p50/p95/p99 (knowledge)",
    description:
      "Daily latency percentiles for knowledge chat completions. Alert A (latency) source.",
    hogql: `
      SELECT toStartOfDay(timestamp) AS day,
        round(quantile(0.50)(toFloat(properties.latency_ms))) AS p50,
        round(quantile(0.95)(toFloat(properties.latency_ms))) AS p95,
        round(quantile(0.99)(toFloat(properties.latency_ms))) AS p99
      FROM events WHERE ${KNOWLEDGE} AND ${WINDOW}
      GROUP BY day ORDER BY day`,
  },
  {
    name: "Latency attribution: retrieval vs LLM (knowledge)",
    description:
      "Daily p95 of retrieval vs LLM latency, to attribute Alert A regressions.",
    hogql: `
      SELECT toStartOfDay(timestamp) AS day,
        round(quantile(0.95)(toFloat(properties.latency_retrieval_ms))) AS retrieval_p95,
        round(quantile(0.95)(toFloat(properties.latency_llm_ms))) AS llm_p95
      FROM events WHERE ${KNOWLEDGE} AND ${WINDOW}
      GROUP BY day ORDER BY day`,
  },
  {
    name: "Chat error rate",
    description:
      "Daily error rate across all chat completions. Reliability signal.",
    hogql: `
      SELECT toStartOfDay(timestamp) AS day,
        round(avg(if(properties.status = 'error', 1, 0)), 4) AS error_rate,
        count() AS requests
      FROM events WHERE event = 'chat_completion' AND ${WINDOW}
      GROUP BY day ORDER BY day`,
  },
  {
    name: "Chat abort rate",
    description: "Daily client-abort rate. Alert B (abort spike) source.",
    hogql: `
      SELECT toStartOfDay(timestamp) AS day,
        round(avg(if(properties.aborted, 1, 0)), 4) AS abort_rate,
        count() AS requests
      FROM events WHERE event = 'chat_completion' AND ${WINDOW}
      GROUP BY day ORDER BY day`,
  },
  {
    name: "Response cache hit rate (knowledge)",
    description:
      "Daily response-cache hit rate for knowledge traffic. Alert C (cache) source.",
    hogql: `
      SELECT toStartOfDay(timestamp) AS day,
        round(avg(if(properties.response_cache_hit, 1, 0)), 4) AS hit_rate,
        count() AS requests
      FROM events WHERE ${KNOWLEDGE} AND ${WINDOW}
      GROUP BY day ORDER BY day`,
  },
  {
    name: "Chat volume & distinct users",
    description:
      "Daily chat request count and distinct users. Volume-gate context for alerts.",
    hogql: `
      SELECT toStartOfDay(timestamp) AS day,
        count() AS requests,
        uniq(person_id) AS distinct_users
      FROM events WHERE event = 'chat_completion' AND ${WINDOW}
      GROUP BY day ORDER BY day`,
  },
];

export type LangfuseScoreDataType = "NUMERIC" | "BOOLEAN" | "CATEGORICAL";

export type LangfuseScoreConfigDef = {
  name: string;
  dataType: LangfuseScoreDataType;
  minValue?: number;
  maxValue?: number;
  description?: string;
};

// Mirrors the scores emitted in lib/server/telemetry/langfuse-scores.ts.
// Configs give the Scores view proper types/ranges and stop ad-hoc inference.
export const LANGFUSE_SCORE_CONFIGS: LangfuseScoreConfigDef[] = [
  {
    name: "user_feedback",
    dataType: "BOOLEAN",
    description: "👍/👎 on an answer (1 = helpful, 0 = not).",
  },
  {
    name: "retrieval_insufficient",
    dataType: "BOOLEAN",
    description: "1 when retrieval was judged insufficient for the answer.",
  },
  {
    name: "retrieval_highest_score",
    dataType: "NUMERIC",
    minValue: 0,
    maxValue: 1,
    description: "Highest similarity score among retrieved chunks.",
  },
  {
    name: "context_unique_docs",
    dataType: "NUMERIC",
    minValue: 0,
    description: "Count of unique documents in the selected context.",
  },
];
