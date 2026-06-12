# Analytics as code

Dashboard/insight and score-schema definitions live in the repo, not only in the
backends' UIs. This makes them reviewable in PRs, reproducible across
environments, and kept in lockstep with the event/score schema the app emits —
the same "infrastructure as code" idea applied to analytics. It also closes the
class of bug that started this whole effort: a UI-only insight silently defined
wrong (e.g. WAU computed with `dau` math) or serving a stale cache, with no
diff to catch it.

## Run it

```bash
pnpm telemetry:sync
```

Idempotent: the managed dashboard and insights are matched by name and **reused/
updated in place** (no duplicates on re-run); Langfuse score configs are
**created only when missing**. Each backend is skipped (not failed) when its
credentials are absent.

## What it manages

Definitions: [`lib/server/telemetry/analytics-definitions.ts`](../../lib/server/telemetry/analytics-definitions.ts) · Runner: [`scripts/telemetry/sync-analytics.ts`](../../scripts/telemetry/sync-analytics.ts)

Insights are grouped into two managed dashboards (name-prefixed `[as-code]`,
tagged `as-code`), split by purpose — **operational** (real-time, page-worthy)
vs **overview** (daily trends, review-worthy):

**`[as-code] Chat - Alerts`** — operational signals (contract A/B/C), short
windows / hourly:

| Insight | Signal |
| --- | --- |
| Alert A — P99 latency (hourly) | latency p99, last 24h |
| Alert B — abort count (knowledge) | aborted knowledge requests, last 1h |
| Alert C — cache hit rate (knowledge) | response-cache hits / total |

**`[as-code] Chat - Core Health`** — daily-trend overview:

| Insight | Shows |
| --- | --- |
| Chat completion outcomes (success vs failure) | volume by status |
| Cache effectiveness — latency impact | avg latency by hit/miss |
| Token consumption by RAG mode | `sum(total_tokens)` by rag_enabled |
| Average latency by preset | avg latency by preset_key |
| Chat latency p50/p95/p99 (knowledge) | latency percentile trend |
| Latency attribution: retrieval vs LLM | p95 retrieval vs LLM |
| Chat volume & distinct users | requests + DAU |

Knowledge traffic is filtered by `rag_enabled` (PostHog has no `intent` filter —
see [alerting-contract.md](../canonical/telemetry/alerting-contract.md)).

> **Consolidation history:** an earlier HogQL `[as-code] Chat telemetry` dashboard
> was folded into these two (it duplicated the operational/overview signals in a
> weaker daily-SQL form). The sync soft-deletes superseded dashboards/insights
> listed in `RETIRED_DASHBOARD_NAMES` / `RETIRED_INSIGHT_NAMES`, so consolidation
> is reproducible, not a manual edit.
>
> Insight definitions can be HogQL (`DataVisualizationNode`) or native
> `TrendsQuery` (`InsightVizNode`); the dashboards above use TrendsQuery (richer,
> alertable). The hand-built (non-`[as-code]`) originals were retired.

### Langfuse score configs

Gives the Scores view proper types/ranges (mirrors the scores emitted in
`lib/server/telemetry/langfuse-scores.ts`):

| Score | Type | Range |
| --- | --- | --- |
| `user_feedback` | BOOLEAN | — |
| `retrieval_insufficient` | BOOLEAN | — |
| `retrieval_highest_score` | NUMERIC | 0–1 |
| `context_unique_docs` | NUMERIC | ≥ 0 |

## Credentials & environment

Read/analysis credentials only — this is a local/CI tool, **never** the prod web
app. See [setup.md](setup.md): PostHog needs `POSTHOG_PERSONAL_API_KEY`
(`phx_…`, not the capture key); Langfuse uses the standard public/secret keys.
Adding a definition and re-running `pnpm telemetry:sync` is the supported way to
change a managed insight — editing it in the UI will be overwritten on next sync.

## Scope notes

- LangSmith is intentionally **not** managed here — this repo uses it only as a
  passive nested-trace viewer (zero-code, env-driven). See the
  [README backend table](README.md#three-observability-backends-at-a-glance).
- Native PostHog threshold alerts are not provisioned by this script; it manages
  insight definitions. Wiring alerts is a possible follow-up.
