# Step 1‑3 Audit Report

This report captures the contract between the three telemetry phases, summarizes the canonical signal mapping, and keeps a running TODO list for follow-up work.

## Canonical Alert Signals

| Alert | Step 2 Source Event(s) | Step 2 Properties | Step 3 Usage |
| ----- | ---------------------- | ----------------- | ----------- |
| **A – End-to-End Latency (p99) regression** | `chat_request_completed`, `latency_breakdown` | `duration_ms`, `latency_breakdown.latency_retrieval_ms`, `latency_breakdown.latency_llm_ms`, plus shared context (`env`, `intent`, `preset`) | Tiles 2/3 for p50/p99, Tiles 5/6 for attribution, Alert A uses the same filters and volume gates |
| **B – Abort rate spike** | `chat_request_completed` | `aborted`, `duration_ms` (for correlation), `env`, `intent` | Tile 4 rate insight, Alert B builds the same numerator/denominator and volume gate |
| **C – Cache inefficiency (hit rate + hit/miss parity)** | `cache_decision`, `chat_request_completed` | `response_cache_hit`, `retrieval_cache_hit`, `duration_ms` split by hit/miss, shared context | Tile 7 (hit rate), Tile 8 (hit vs miss latency), Alert C-1/C-2 implement these comparisons |

## Mismatches (before/after this audit)

1. **Alert definitions missing (Step 1)** – `docs/telemetry/langfuse-alert.md` originally only described Alert A; Alerts B and C lacked intent, severity, volume gates, correlation rules, and immediate actions. Resolved by adding Alert Group B and C sections with those details.
2. **Signal mapping gap (Step 2 vs Step 3)** – Step 3 referenced `chat_request_completed.response_cache_hit` in Alert C-2 and Tile 8, but `docs/telemetry/langfuse-posthog-mapping.md` did not list that property on `Event 1`. Fixed by adding the `response_cache_hit`/`retrieval_cache_hit` mapping and calling out Step 3 usage in `Event 1`.
3. **Native percentile comparison limits** – PostHog cannot compare two filtered percentile aggregates directly. The instructions in `docs/telemetry/posthog-alerts.md#c-2-cache-hit-latency-not-better-than-miss` now document the fallback (page on C-1 and use Tile 8), but the mismatch remains operational: implementing C-2’s ratio still requires custom derived data or tooling.

## Prioritized TODO

- **P0 – Validate telemetry export for response cache metadata** (`docs/telemetry/langfuse-posthog-mapping.md#event-1`)  
  Ensure the code that emits `chat_request_completed` actually forwards `response_cache_hit`/`retrieval_cache_hit` to PostHog; add instrumentation or batching fixes if a downstream ingestion shows nulls in that property.
- **P1 – Build the hit/miss percentile ratio implementation** (`docs/telemetry/posthog-alerts.md#c-2-cache-hit-latency-not-better-than-miss`)  
  The doc now documents the desired comparison and the fallback when PostHog cannot express it. Follow up by creating the derived query or automation (custom insight, derived event, or CDP script) that reliably produces `p50_hit` vs `p50_miss` so C-2 can be paged without manual interpretation.
- **P2 – Keep Step 1 immediate actions in sync with Step 4 runbooks** (`docs/telemetry/langfuse-alert.md#alert-group-a-latency-user-perceived-performance`, `#alert-group-b-abort-rate-spike`, `#alert-group-c-cache-inefficiency`)  
  As the runbook (Step 4) develops, revisit these sections to ensure the “Immediate Actions” and “Correlation Rules” there remain actionable and reference the correct dashboards/insights described in Step 3.
