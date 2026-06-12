# Weekly telemetry digest

Turns raw Langfuse scores into a structured, actionable digest — the "analysis layer" on top of observability. It answers *so what?*, not just *what happened*.

## Run it

```bash
pnpm telemetry:digest            # last 7 days
pnpm telemetry:digest --days 30  # custom window
pnpm telemetry:digest --out docs/telemetry/digests/2026-06-11.md
```

Loads Langfuse credentials from `.env.local` (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`).

## What it reports

| Section | Source | Why it matters |
| --- | --- | --- |
| User satisfaction | `user_feedback` scores (👍/👎) | Ground truth for answer quality — see [langfuse-guide.md](langfuse-guide.md#user-feedback-score-user_feedback) |
| Retrieval quality | `retrieval_highest_score`, `retrieval_insufficient`, `context_unique_docs` | Proxy signals for how well retrieval did |
| **Proxy vs. human** | join of `user_feedback` ↔ `retrieval_insufficient` by `traceId` | The payoff of P1: a 2×2 cross-tab showing where the proxy and the human **disagree** |
| Product metrics (PostHog) | HogQL over `chat_completion` | Volume, latency, error/abort/cache rates (when a PostHog personal key is set) |
| Engineering metrics (Langfuse) | Langfuse metrics API (`/api/public/metrics`) | Trace/observation volume and — uniquely — model **cost** in $ (PostHog tracks tokens, not cost) |
| Takeaways | deterministic rule-based flags | Reproducible, no LLM, no hallucinated numbers |

The divergence cross-tab is the point. The off-diagonal cells are leads:

- **insufficient + 👍** → the `insufficient` proxy is too strict (or the model recovered). Consider relaxing the threshold.
- **sufficient + 👎** → retrieval was fine but the answer still disappointed. Look at generation, not retrieval.

## Architecture

- `lib/server/telemetry/digest.ts` — pure aggregation (`computeWeeklyDigest`) + markdown rendering (`renderWeeklyDigestMarkdown`). No I/O, unit-testable.
- `scripts/telemetry/weekly-digest.ts` — thin I/O runner: paginates the Langfuse scores API, calls the pure functions, prints markdown.

## PostHog product metrics (optional)

The digest folds in a **Product metrics (PostHog)** section — chat request volume, distinct users, latency p50/p95/p99, error/abort rates, response-cache-hit rate, and avg tokens — when a PostHog **personal** API key is configured. Querying product analytics needs a personal key (`phx_…`); the `phc_…` key already in the env is for event *capture* only and cannot read.

Add to `.env.local` — only the first line is required:

```
POSTHOG_PERSONAL_API_KEY=phx_xxxxxxxx   # required. Settings → Personal API keys (scope: query:read)
POSTHOG_PROJECT_ID=258089               # optional; defaults to @current (the key's default project)
POSTHOG_API_HOST=https://us.posthog.com # optional; defaults to US cloud
```

Without the personal key the section is skipped silently and the digest stays Langfuse-only. The metrics come from a single HogQL aggregation over `chat_completion` events; see `fetchPostHogMetrics` in the runner.

## Known limits / extension points

- **Rule-based, not LLM-written.** Takeaways are deterministic flags by design. For prose interpretation, run the digest from the `weekly-telemetry-digest` scheduled routine and let the model narrate over the structured output.
