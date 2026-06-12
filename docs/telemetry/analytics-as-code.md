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

Insights are grouped into three managed dashboards (all name-prefixed
`[as-code]`, tagged `as-code`, created on first sync and reused thereafter):

**`[as-code] Chat telemetry`** — HogQL daily overview:

| Insight | Maps to |
| --- | --- |
| Chat latency p50/p95/p99 (knowledge) | Alert A (latency) |
| Latency attribution: retrieval vs LLM (knowledge) | Alert A attribution |
| Chat error rate | Reliability |
| Chat abort rate | Alert B (abort spike) |
| Response cache hit rate (knowledge) | Alert C (cache) |
| Chat volume & distinct users | Volume gate context |

**`[as-code] Chat - Alerts`** — operational TrendsQuery signals (adopted from the
hand-built "Chat - Alerts" dashboard, definitions corrected): Alert A p99 latency,
Alert B abort count, Alert C cache **hit rate** (the old tile measured median
latency of cache hits only — no cache dimension — so it never measured the signal
its name claimed; replaced with hits/total).

**`[as-code] Chat - Core Health`** — MVP health (adopted from "Chat – Core Health
(MVP)", corrected): completion outcomes, cache latency impact, **token consumption**
(the old tile used request count, not `sum(total_tokens)` — fixed), avg latency by
preset.

Knowledge traffic is filtered by `rag_enabled` (PostHog has no `intent` filter —
see [alerting-contract.md](../canonical/telemetry/alerting-contract.md)).

> Insight definitions can be either HogQL (`DataVisualizationNode`) or native
> `TrendsQuery` (`InsightVizNode`) — the latter is alertable and used for the
> adopted dashboards. The hand-built (non-`[as-code]`) originals can be retired
> once the managed versions are verified.

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
