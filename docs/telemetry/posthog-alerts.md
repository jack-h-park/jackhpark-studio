 # Step 3 — PostHog Alerts + Dashboards (Design & Implementation Guide)

This document codifies the **current reality** of our PostHog free-plan setup: we only have capacity for **two alerts** and rely on insights for everything else. It consumes the signal contract defined in Step 1 (`docs/telemetry/langfuse-alert.md`) and mapped in Step 2 (`docs/telemetry/langfuse-posthog-mapping.md`) without inventing new telemetry. Alert C remains documentation-only until we can upgrade the plan.

## How these docs relate (Step 1–3 chain)
- Step 1 defines the tool-agnostic alert specs and severity expectations.
- Step 2 provides the canonical Langfuse→PostHog signals we consume (`chat_completion`, `latency_ms`, etc.).
- Step 3 (this document) describes the PostHog-specific realization: UI guidance, plan limits, and scheduling/volume constraints.
- Langfuse Step 1 labels the alerts as P1 for the canonical contract; inside the PostHog context we treat the active alerts as P0 (primary operational paging) because paging is only available for these two signals today. This doc explicitly reconciles both perspectives.

## PostHog Plan / Feature Constraints
- **Alert cap**: Free tier allows max 2 alerts. We run Alert A (latency) and Alert B (abort count); Alert C is documented only—**not enabled**—due to the cap.
- **No OR across filters**: PostHog Alerts cannot mix properties with OR logic; each filter combination requires its own insight or derived event.
- **Interval limits**: “Run alert every” is tied to “Check last” and cannot express sustained 5-minute windows while staying on an hourly cadence. We run hourly checks over the last hour to balance responsiveness and noise.
- **Property availability**: Filter keys like `rag_enabled`, `response_cache_hit`, `env`, etc., appear only after PostHog ingests events with those keys. Use Live events to confirm ingestion before building alerts.
- **Alert C status**: It remains a documented P2 insight (cache hit vs miss) that we evaluate manually today; we upgrade it to an actual alert only once the plan supports a third alert and we can derive the numerator/denominator ratio externally.

## Alerting inputs
- **Event**: `chat_completion`
- **Latency property**: `latency_ms` (PostHog surfaces “Property value → median” as the closest equivalent to p50)
- **Common filters**: `status`, `aborted`, `rag_enabled`, `response_cache_hit`
+ **Additional context**: `env`, `preset_key`, `model`, `total_tokens`, `error_type`
- **Plan constraint**: Free tier allows 2 alerts; only Alerts A/B are created. Alert C stays as an insight plus runbook action.

## PostHog UI limitations (documented up front)
- **Property dropdowns appear only after ingestion**. If `rag_enabled`, `response_cache_hit`, or `preset_key` don’t show up, wait for a few `chat_completion` events with those keys or inspect via `Events → Live`. Re-check filters once ingestion is confirmed.
- **Median is PostHog’s only p50 proxy**; select “Property value” → `median` (PostHog labels this “median”) when configuring Alert A.
- **“Run alert every” and “Check last” are coupled**: you cannot run hourly while checking the last 2 hours. Choose a window that matches traffic (we currently run hourly checks with “Check last 1 hour”). There is no way to express sustained 5-minute windows without custom tooling.
- **“Check ongoing period”**: Keep this **off** for Alert A/B because the free plan’s dedup windows already prevent duplicate pages; “ongoing” only makes sense when you want per-minute re-evaluation without gating.
- **Dedup/cooldown**: PostHog supports dedup keys and cooldown periods. We tag alerts by `env` (and optionally `preset_key`) and use a 30-minute cooldown manually in the on-call runbook. If more granularity is needed, encode `env|preset_key` into the dedup key so each preset gets its own cooldown bucket.

## Volume gate strategy
- Because PostHog Alerts on the free plan cannot express complex gating, we enforce volume manually:
  1. Scope each alert to `env` (prod/staging) so paging happens only when that environment is noisy.
  2. In the alert description, instruct operators to verify ≥ 30 knowledge requests in the last hour before acknowledging.
  3. Use PostHog dashboards or `chat_completion` counts to confirm the denominator is large enough; do not page for low-volume windows.

## Alert A — End-to-End Latency p99 Regression (P0)
- **Insight**: Trend on `chat_completion` → `latency_ms`, aggregation = median/property value’s `99th percentile approximation`.
- **Filters**:  
  `status=success`, `aborted=false`, `rag_enabled=true`, plus `env=<target env>` (prod first, then promote to staging once stable). PostHog does not emit `intent`, so `rag_enabled=true` is the knowledge proxy.
- **Threshold guide**: Start with **9,000 ms** (9s) as a conservative production threshold. Tune down once latency stability is verified; raise to 12s for noise immunity in dev/preview.
- **Run cadence**:  
  - **Run alert every**: 1 hour (PostHog doesn’t support last-5-minute sustained windows with hourly evaluation).  
  - **Check last**: 1 hour (coupled with run window).  
  - “Check ongoing period”: OFF to avoid “per-minute” noise.
- **Advanced notes**:  
  - Documented threshold should include the baseline you expect; if you later compute a rolling baseline externally, update this doc with the new numeric value.  
  - Include the current p99 and prior hour’s trend in the alert body (PostHog supports templated descriptions).  
  - Dedup + cooldown: assign `env` as the dedup key so you don’t page multiple times for prod/staging simultaneously; add a manual 30-minute cooldown in the runbook.
- **When to lower threshold**: Once dev/staging are stable and `chat_completion` volume grows, consider lowering to 7s while still monitoring noise via the traceback insight (Average latency by preset_key).

## Alert B — Abort Spike (P1)
- **Insight**: Trend counting `chat_completion` where `aborted=true` (absolute count, not a rate).
- **Filters**: `rag_enabled=true`, `env=<target env>`. Include `status=aborted` if PostHog exposes it; otherwise rely on `aborted=true`.
- **Threshold guide**: Trigger when abort count exceeds **15** in the last hour for prod (lower to ~5 for staging/dev). Because PostHog can’t express percentages reliably, we use an absolute count and interpret in context.
- **Run cadence**: same as Alert A (run hourly, check last hour). PostHog’s “run every” cannot be lower than 1 hour on free plan once we limit to 2 alerts; therefore this cadence balances responsiveness and noise.
- **Volume gate**: Ensure the last hour saw ≥ 30 RAG-enabled completions before paging; include that check in the description or runbook step.
- **Dedup/cooldown**: Use `env` dedup key, 30-minute cooldown manually enforced. If aborts spike across multiple presets, add `|preset_key` into the dedup key to avoid multi-pages.
- **Fallback**: PostHog does not emit `intent`; we treat `rag_enabled=true` as a “knowledge-ish” proxy. If we later emit `intent`, update the filters accordingly.

## Alert C — Cache Hit vs Miss Median (P2 doc-only)
- **Insight**: Median (`Property value → median`) `latency_ms` for `response_cache_hit=true` and `false`, or the ratio of those medians. Use `chat_completion` event with `response_cache_hit` filter.
- **Why doc-only**: Free plan only allows two alerts. The insight exists for manual comparisons, but we keep Alert C as documentation and runbook guidance.
- **Intended alert logic (if we upgrade)**:  
  1. Create a derived metric (SQL job, PostHog derived event, or platform script) that computes `p50(duration_ms | response_cache_hit=true) / p50(duration_ms | response_cache_hit=false)`.  
 2. Alert when that ratio ≥ 0.9 (i.e., cache-hit latency is 90% of miss latency) for 1 hour.  
 3. Filters: `rag_enabled=true`, `status=success`, `env=<target>`; optionally `response_cache_hit=true` once the ratio signal is ready.  
 4. Run cadence: hourly with “check last 1 hour”; dedup by env.
- **Fallback procedure**: When no alert exists, operators compare the “Cache Effectiveness (Latency)” insight manually after an Alert A/B incident. Document that the runbook should mention the insight, the last ingest timestamp, and any derived ratio scoreboard.

## Dev vs Prod rollout guidance
- **Start in dev** with higher thresholds (e.g., 12s for Alert A, 7 aborts for Alert B) and manual review. Confirm `chat_completion` volume ≥ 50/hour before adding prod filters.
- **Promote to prod** when dev/staging show quiet alerts for a week. At that point, add `env=prod` filter and drop dedup to `env|preset_key` to keep pages actionable while still acknowledging cross-preset noise.
- **No `env=prod` yet?** Keep filters broad, but include `env` in PostHog note so that once the property is available, you can retro-fit the scoping without changing alert logic.
- **Property visibility troubleshooting**: If `status`/`aborted`/`rag_enabled` do not appear in filters, confirm events streamed via `Live events` or sample logs. Clear PostHog caches by refreshing events, and re-open the filter dropdown after ingestion completes.

## Summary
- These two alerts (A = p99 latency, B = abort count) represent the only automated paging we can run today.  
- PostHog dashboards (docs/telemetry/posthog-dashboard.md) provide the supporting signals and manual comparisons, including the plan-limited Alert C doc-only logic.  
- Keep this doc updated whenever we change thresholds, plan tier, or add new derived metrics for Alert C.

## Change log
- Clarified how PostHog docs continue the Step 1–3 contract, highlighted plan constraints, and reconciled P0/P1 terminology.  
- Documented required `chat_completion` properties (`status`, `aborted`, `rag_enabled`, `env`, `preset_key`, `latency_*`, `total_tokens`, `error_type`, `response_cache_hit`) and the PostHog ingestion dependency.  
- Spelled out Alert A/B scheduling, dedup, and volume gate guidance; reaffirmed Alert C as documentation-only until the alert cap lifts.
