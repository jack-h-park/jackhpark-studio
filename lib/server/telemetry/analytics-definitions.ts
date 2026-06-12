/**
 * Analysis definitions as code — the version-controlled source of truth for
 * PostHog dashboards/insights and Langfuse score configs. Keeping these in the
 * repo (vs. UI-only) makes them reviewable, reproducible, and recreatable, and
 * keeps the definitions in lockstep with the event/score schema the app emits.
 *
 * Synced by scripts/telemetry/sync-analytics.ts (`pnpm telemetry:sync`).
 */

/** Marks an insight/dashboard as managed by this file (tag) for grouping. */
export const MANAGED_INSIGHT_TAG = "as-code";

/** Prefix on managed names so the sync can match them unambiguously. */
export const MANAGED_INSIGHT_PREFIX = "[as-code]";

/** A PostHog query node: an InsightVizNode (Trends/Funnel/…) or HogQL node. */
export type InsightQuery = Record<string, unknown>;

export type ManagedInsight = {
  /** Stable name without prefix; the sync prepends MANAGED_INSIGHT_PREFIX. */
  name: string;
  description: string;
  query: InsightQuery;
};

export type ManagedDashboard = {
  /** Full dashboard name (already prefixed). */
  name: string;
  description: string;
  insights: ManagedInsight[];
};

const SYNC_NOTE =
  "Managed by `pnpm telemetry:sync`. Edit lib/server/telemetry/analytics-definitions.ts — UI edits are overwritten on next sync.";

// Knowledge traffic is identified by rag_enabled (PostHog has no `intent`
// filter) — see docs/canonical/telemetry/alerting-contract.md.
const KNOWLEDGE = "event = 'chat_completion' AND properties.rag_enabled";
const WINDOW = "timestamp > now() - toIntervalDay(30)";

function hogqlInsight(
  name: string,
  description: string,
  hogql: string,
): ManagedInsight {
  return {
    name,
    description,
    query: {
      kind: "DataVisualizationNode",
      source: { kind: "HogQLQuery", query: hogql.trim() },
    },
  };
}

// Reusable property-filter fragments for TrendsQuery insights.
const F = {
  knowledge: { key: "rag_enabled", type: "event", value: ["true"], operator: "exact" },
  success: { key: "status", type: "event", value: ["success"], operator: "exact" },
  notAborted: { key: "aborted", type: "event", value: ["false"], operator: "exact" },
  cacheHit: { key: "response_cache_hit", type: "event", value: ["true"], operator: "exact" },
} as const;

const andProps = (values: unknown[]): InsightQuery => ({
  type: "AND",
  values: [{ type: "AND", values }],
});

// ── Dashboard 1: HogQL daily overview ────────────────────────────────────────

const TELEMETRY_OVERVIEW: ManagedDashboard = {
  name: `${MANAGED_INSIGHT_PREFIX} Chat telemetry`,
  description: `Daily HogQL overview of chat telemetry. ${SYNC_NOTE}`,
  insights: [
    hogqlInsight(
      "Chat latency p50/p95/p99 (knowledge)",
      "Daily latency percentiles for knowledge chat completions. Alert A (latency) source.",
      `SELECT toStartOfDay(timestamp) AS day,
         round(quantile(0.50)(toFloat(properties.latency_ms))) AS p50,
         round(quantile(0.95)(toFloat(properties.latency_ms))) AS p95,
         round(quantile(0.99)(toFloat(properties.latency_ms))) AS p99
       FROM events WHERE ${KNOWLEDGE} AND ${WINDOW}
       GROUP BY day ORDER BY day`,
    ),
    hogqlInsight(
      "Latency attribution: retrieval vs LLM (knowledge)",
      "Daily p95 of retrieval vs LLM latency, to attribute Alert A regressions.",
      `SELECT toStartOfDay(timestamp) AS day,
         round(quantile(0.95)(toFloat(properties.latency_retrieval_ms))) AS retrieval_p95,
         round(quantile(0.95)(toFloat(properties.latency_llm_ms))) AS llm_p95
       FROM events WHERE ${KNOWLEDGE} AND ${WINDOW}
       GROUP BY day ORDER BY day`,
    ),
    hogqlInsight(
      "Chat error rate",
      "Daily error rate across all chat completions. Reliability signal.",
      `SELECT toStartOfDay(timestamp) AS day,
         round(avg(if(properties.status = 'error', 1, 0)), 4) AS error_rate,
         count() AS requests
       FROM events WHERE event = 'chat_completion' AND ${WINDOW}
       GROUP BY day ORDER BY day`,
    ),
    hogqlInsight(
      "Chat abort rate",
      "Daily client-abort rate. Alert B (abort spike) source.",
      `SELECT toStartOfDay(timestamp) AS day,
         round(avg(if(properties.aborted, 1, 0)), 4) AS abort_rate,
         count() AS requests
       FROM events WHERE event = 'chat_completion' AND ${WINDOW}
       GROUP BY day ORDER BY day`,
    ),
    hogqlInsight(
      "Response cache hit rate (knowledge)",
      "Daily response-cache hit rate for knowledge traffic. Alert C (cache) source.",
      `SELECT toStartOfDay(timestamp) AS day,
         round(avg(if(properties.response_cache_hit, 1, 0)), 4) AS hit_rate,
         count() AS requests
       FROM events WHERE ${KNOWLEDGE} AND ${WINDOW}
       GROUP BY day ORDER BY day`,
    ),
    hogqlInsight(
      "Chat volume & distinct users",
      "Daily chat request count and distinct users. Volume-gate context for alerts.",
      `SELECT toStartOfDay(timestamp) AS day,
         count() AS requests,
         uniq(person_id) AS distinct_users
       FROM events WHERE event = 'chat_completion' AND ${WINDOW}
       GROUP BY day ORDER BY day`,
    ),
  ],
};

// ── Dashboard 2: operational alerts (TrendsQuery) ────────────────────────────
// Adopted from the hand-built "Chat - Alerts" dashboard, definitions corrected.

const trends = (source: InsightQuery): InsightQuery => ({
  kind: "InsightVizNode",
  source: { kind: "TrendsQuery", version: 2, ...source },
});

const CHAT_ALERTS: ManagedDashboard = {
  name: `${MANAGED_INSIGHT_PREFIX} Chat - Alerts`,
  description: `Operational alert signals (contract A/B/C). ${SYNC_NOTE}`,
  insights: [
    {
      name: "Alert A — P99 latency (hourly)",
      description: "p99 latency_ms for successful knowledge requests, last 24h.",
      query: trends({
        series: [
          {
            kind: "EventsNode",
            event: "chat_completion",
            name: "chat_completion",
            math: "p99",
            math_property: "latency_ms",
            math_property_type: "numerical_event_properties",
          },
        ],
        interval: "hour",
        dateRange: { date_from: "-24h", date_to: null, explicitDate: false },
        properties: andProps([F.success, F.notAborted, F.knowledge]),
        trendsFilter: { aggregationAxisFormat: "duration_ms" },
      }),
    },
    {
      name: "Alert B — abort count (knowledge)",
      description: "Aborted knowledge requests per minute, last 1h. Alert B source.",
      query: trends({
        series: [
          {
            kind: "EventsNode",
            event: "chat_completion",
            name: "chat_completion",
            math: "total",
          },
        ],
        interval: "minute",
        dateRange: { date_from: "-1h" },
        properties: andProps([
          { key: "aborted", type: "event", value: ["true"], operator: "exact" },
          F.knowledge,
        ]),
        trendsFilter: {},
      }),
    },
    {
      // FIX: the hand-built tile measured median latency of cache HITS only —
      // no cache dimension, so it never measured "inefficiency". Replaced with
      // the actual Alert C-1 signal: response-cache hit rate (hits / total).
      name: "Alert C — cache hit rate (knowledge)",
      description:
        "Response-cache hit rate for successful knowledge requests (A=hits / B=total). Alert C-1 source.",
      query: trends({
        series: [
          {
            kind: "EventsNode",
            event: "chat_completion",
            name: "hits",
            math: "total",
            properties: [F.success, F.knowledge, F.cacheHit],
          },
          {
            kind: "EventsNode",
            event: "chat_completion",
            name: "total",
            math: "total",
            properties: [F.success, F.knowledge],
          },
        ],
        interval: "hour",
        dateRange: { date_from: "-24h", date_to: null, explicitDate: false },
        trendsFilter: {
          formula: "A / B",
          aggregationAxisFormat: "percentage",
          display: "ActionsLineGraph",
        },
      }),
    },
  ],
};

// ── Dashboard 3: core health (TrendsQuery) ───────────────────────────────────
// Adopted from "Chat – Core Health (MVP)", token tile corrected.

const CHAT_CORE_HEALTH: ManagedDashboard = {
  name: `${MANAGED_INSIGHT_PREFIX} Chat - Core Health`,
  description: `MVP health overview. ${SYNC_NOTE}`,
  insights: [
    {
      name: "Chat completion outcomes (success vs failure)",
      description: "Completion volume broken down by status.",
      query: trends({
        series: [
          {
            kind: "EventsNode",
            event: "chat_completion",
            name: "chat_completion",
            math: "total",
          },
        ],
        trendsFilter: { display: "ActionsUnstackedBar" },
        breakdownFilter: { breakdowns: [{ type: "event", property: "status" }] },
      }),
    },
    {
      name: "Cache effectiveness — latency impact",
      description: "Avg latency of successful requests, split by response_cache_hit.",
      query: trends({
        series: [
          {
            kind: "EventsNode",
            event: "chat_completion",
            name: "chat_completion",
            math: "avg",
            math_property: "latency_ms",
            math_property_type: "numerical_event_properties",
          },
        ],
        interval: "day",
        dateRange: { date_from: "-3d", date_to: "", explicitDate: false },
        properties: andProps([F.success]),
        trendsFilter: { display: "ActionsUnstackedBar", aggregationAxisFormat: "duration_ms" },
        breakdownFilter: {
          breakdowns: [{ type: "event", property: "response_cache_hit" }],
        },
      }),
    },
    {
      // FIX: titled "Token Consumption" but used math:total (request COUNT).
      // Corrected to sum(total_tokens).
      name: "Token consumption by RAG mode (on vs off)",
      description: "Sum of total_tokens for successful requests, split by rag_enabled.",
      query: trends({
        series: [
          {
            kind: "EventsNode",
            event: "chat_completion",
            name: "chat_completion",
            math: "sum",
            math_property: "total_tokens",
            math_property_type: "numerical_event_properties",
          },
        ],
        properties: andProps([F.success]),
        trendsFilter: {},
        breakdownFilter: {
          breakdowns: [{ type: "event", property: "rag_enabled" }],
        },
      }),
    },
    {
      name: "Average latency by preset (successful)",
      description: "Avg latency_ms of successful requests, split by preset_key.",
      query: trends({
        series: [
          {
            kind: "EventsNode",
            event: "chat_completion",
            name: "chat_completion",
            math: "avg",
            math_property: "latency_ms",
            math_property_type: "numerical_event_properties",
          },
        ],
        properties: andProps([F.success]),
        trendsFilter: { display: "ActionsUnstackedBar", aggregationAxisFormat: "duration_ms" },
        breakdownFilter: {
          breakdowns: [{ type: "event", property: "preset_key" }],
        },
      }),
    },
  ],
};

export const MANAGED_DASHBOARDS: ManagedDashboard[] = [
  TELEMETRY_OVERVIEW,
  CHAT_ALERTS,
  CHAT_CORE_HEALTH,
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
