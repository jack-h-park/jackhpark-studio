# PostHog operations

> **Derives from canonical:** [Telemetry alerting contract](../alerting-contract.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

This is the Step 3 realization of the telemetry chain: it enforces the alert contract from `alerting-contract.md` using PostHog dashboards, trends, and the two alerts allowed on the free plan. Treat this doc as the source of truth for dashboard tiles, alert schedules, and the cache hit/miss fallback strategy.  
All thresholds and field names below must remain consistent with the canonical contract, so adjust them only after updating `alerting-contract.md`.

## Current state & plan constraints
- **Alert cap:** PostHog free tier permits exactly two alerts. We allocate them to Alert A (p99 latency) and Alert B (abort spikes); Alert C is documented but not paged until we upgrade the plan or derive the ratio outside PostHog.
- **Spec → mapping recency:** Alerts and dashboards must consume only the signals defined in `alerting-contract.md`; no new telemetry may be introduced in this implementation guide.
- **Dedup/cooldown:** Dedup keys include `env` (and optionally `preset_key`) with a manual 30m cooldown enforced by the on-call runbook to avoid duplicate pages across environments.
- **Property availability:** PostHog exposes filters only after the first few events containing the property; use `Live events` to verify that `rag_enabled`, `status`, `response_cache_hit`, etc. are present before building or modifying alerts.

## PostHog dashboard tile plan
Tile numbers correspond to the operational board referenced from the Langfuse dashboards. Operators should open these insights after an alert fires.

1. **[P0] Chat completion count by `status`** (`chat_completion`, filter `status`). Use this to validate Alert B’s abort spike and to ensure `error`/`success` traffic trends remain stable.
2. **[P0] Cache effectiveness (latency)** (`chat_completion`, compare `latency_ms` medians for `response_cache_hit=true` vs `false`). This insight backs Alert C diagnostics despite being manual today.
3. **[P0] Average latency by `preset_key` (success only)** filters on `status=success` and `rag_enabled=true` so responders can zoom into each preset after Alert A fires.
4. **[P0] Average tokens per minute, RAG on vs off** (`total_tokens` grouped by `rag_enabled`). Mirrors Alert A to highlight whether token inflation is driving latency.
5. **[P1] Average tokens per request, RAG on vs off** (diagnostic only) for cost/context analysis independent of raw volume.
6. **[P1] Chat completion error count by `error_type`** used to understand why error or abort spikes happen when Alert B triggers.
7. **Bonus:** The dashboards also include retrieval attribution tiles (when available) and the Langfuse-native panel described in `langfuse-dashboard.md`.

**Reference:** see `langfuse-dashboard.md` for the Langfuse-side breakdown of the A/B/C layout and tile ownership.

## Alerts
### Alert A — End-to-end latency regression (P0)
- **Event:** `chat_completion` with `status=success`, `rag_enabled=true`, `aborted=false`, and the target `env` filter.
- **Metric:** `latency_ms` median approximating p99; PostHog expresses this via the “Property value → percentile” build (choose 99th approximation).
- **Semantics:** `latency_ms` spans handler entry → request completion (the same `startTime` used by the LangChain handler), so every path—success, error, cache hit, abort—matches the published SLO.
- **Threshold:** Start around 9s in prod, tune toward 7s once the pipeline stabilizes; use 12s/?? for staging/dev noise.
- **Run schedule:** `Run alert every 1 hour` and `Check last 1 hour` (PostHog couples these fields; shorter windows are not supported on the free tier). Keep “Check ongoing period” off.
- **Volume gate:** Note inside the alert description to verify ≥ 30 knowledge requests in the last hour before rowing the page.
- **Dedup/cooldown:** Dedup key `env`. Add `|preset_key` if multiple presets trigger simultaneously. Enforce a 30-minute manual cooldown via the runbook.
- **Description recommendations:** Template the current and prior p99 trend inside the alert body; mention whether the baseline is static or rolling.

### Alert B — Abort spike (P1)
- **Event:** `chat_completion` where `aborted=true` and `rag_enabled=true` (PostHog lacks `intent`, so this is the best proxy). Filter `env` plus `status=aborted` if available.
- **Metric:** Absolute abort count rather than a percentage due to UI limitations.
- **Threshold:** ~15 aborts per hour in prod, ~5 in staging/dev.
- **Run schedule:** Same as Alert A (run hourly, check last hour).
- **Volume gate:** Reminder in the alert text to confirm ≥ 30 RAG-enabled completions in the last hour.
- **Dedup/cooldown:** Dedup key = `env`; extend to `env|preset_key` if multiple presets spike simultaneously.
- **Fallback:** If the `aborted` property or `status` filter is missing, wait for Live events to validate ingestion before editing the alert.

### Alert C — Cache hit vs miss latency (P2 doc-only)
- **Insight-only:** PostHog free plan prohibits additional automated alerts, so Alert C remains documentation-only while dashboards (Tile 2 above) provide manual comparisons.
- **Intended logic (when we upgrade):** derived ratio capturing `p50(latency_ms | response_cache_hit=true) / p50(latency_ms | response_cache_hit=false)` hitting ≥ 0.9 for 1 hour, filtered to `rag_enabled=true`, `status=success`, and scoped by `env` and `preset_key`.
- **Current fallback:** Operators compare the cache effectiveness insight manually and follow the Cache diagnostics section of `oncall-runbook.md` whenever Alerts A/B provide a lead.

## Implementation constraints & guardrails
- **Plan limits:** No OR filters, no sub-hourly `run every` while keeping two alerts; we run hourly checks with 1-hour lookback.
- **Property availability:** If `rag_enabled`, `response_cache_hit`, `preset_key`, `status`, or `aborted` do not appear in the filter dropdown, refresh Live events, wait for ingestion, and re-open the filter panel.
- **Dedup/cooldown:** Use `env` (and optionally `preset_key`) as the dedup key; enforce 30m cooldown manually via the runbook.
- **Volume gate enforcement:** Alert and dashboard descriptions should instruct responders to verify that the denominator (e.g., ≥ 30 requests or ≥ 100 cache decisions) is met before taking action.
- **Manual gating for cache hit ratio:** Because PostHog cannot compare percentiles directly on the free tier, we either compute the ratio via a derived event/external job or fall back to manual comparison on Tile 2. The runbook details how to escalate when the manual comparison flags imbalance.

## Cache hit/miss fallback strategy
1. Track the cache effectiveness insight (`response_cache_hit` vs `false` medians) every time Alert A/B fires.
2. If you can’t compute the ratio in PostHog, ingest the `chat_completion` latency payloads into a small helper (SQL job, script, or derived event) that calculates `p50_hit` and `p50_miss` externally.
3. Alert C becomes actionable once the external signal can express ≥ 90% parity; until then, document the derived result inside the runbook and use Tile 2 for manual verification.
4. Use the new `response_cache_enabled` / `retrieval_cache_enabled` flags to filter cache-capability scopes so that even when a cache is disabled the hit/miss insight remains deterministic.

## Next steps
- PostHog-facing updates must mention `alerting-contract.md` when you change thresholds, property names, or dedup keys.
- Update `oncall-runbook.md` if the on-call playbooks reference new alerts or cooldowns.
- Reference `langfuse-dashboard.md` when describing how the Langfuse tiles complement the PostHog board.
