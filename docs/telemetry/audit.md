# Telemetry audit

This file replaces `step1-3-audit-report.md` and documents what changed in the docs plus the remaining Platform/Product gaps that keep the telemetry chain incomplete.

## Fixed items (docs-level)
- Consolidated Step 1 and Step 2 into `alerting-contract.md`, which now pairs alert intent with the canonical PostHog event/property taxonomy.
- Replaced the old PostHog implementation notes with `posthog-ops.md`, covering dashboard tiles, alert cadence, plan constraints, dedup/cooldown, and the cache hit/miss fallback strategy.
- Added `README.md` as a telemetry index so authors know which doc to consult for spec, implementation, diagnostics, and audit history.
- Kept the operator-facing dashboards, runbook, RAG observation reference, and logging architecture documents intact but updated their cross-links to the new contract/ops docs.

## Remaining gaps
### Code-level (Platform)
- **Emit the canonical PostHog events/properties** listed in `alerting-contract.md`: `chat_completion`, `cache_decision`, `latency_breakdown`, along with `latency_ms`, `aborted`, `response_cache_hit`, `retrieval_cache_hit`, `rag_enabled`, `status`, `error_type`, `total_tokens`, and `preset_key`. This instrumentation still needs to be wired through the Langfuse → PostHog exporter so Step 1–3 contracts can operate in reality.
- **Ensure property stability across environments** (especially `response_cache_hit` / `retrieval_cache_hit`). Missing values break Alert C and cache dashboards. Monitor ingestion logs and add guardrails so these fields never disappear.

### Analytics-level (Platform/Product)
- **Cache hit vs miss percentile ratio** still lacks a PostHog-native implementation due to free-plan limits. Deliver a derived event, SQL job, or lightweight helper that emits `p50_hit`, `p50_miss`, and the ratio so Alert C can move off the manual insight. Until then, document the fallback process in the runbook (see `posthog-ops.md`).
- **Abort-rate percentage awareness** is simplified to an absolute count in PostHog. Product should evaluate whether we need a dashboard or derived metric that computes the denominator cleanly (e.g., `chat_completion` count per hour) so alerts keep meaningful context.

## Prioritized action items
| Priority | Description | Suggested owner |
| -------- | ----------- | --------------- |
| P0 | Instrument the canonical PostHog events (`chat_completion`, `cache_decision`, `latency_breakdown`) with all required properties so the alerts and dashboards can operate without gaps. | Platform |
| P1 | Materialize the cache hit/miss ratio signal (derived event or helper) so Alert C can trigger automatically once we get a third PostHog alert or when the derived signal is exposed as a dashboard. | Platform |
| P2 | Track abort rate denominators (knowledge request counts) inside PostHog analytics so the Alert B narrative can reference true percentages instead of raw counts. | Product + Platform |
