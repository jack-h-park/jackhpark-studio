# Step 1‑3 Audit Report

This report captures the contract between the three telemetry phases, summarizes the canonical signal mapping, and keeps a running TODO list for follow-up work.

## Canonical Alert Signals

| Alert | Step 2 Source Event(s) | Step 2 Properties | Step 3 Usage |
| ----- | ---------------------- | ----------------- | ----------- |
| **A – End-to-End Latency (p99) regression** | `chat_request_completed`, `latency_breakdown` | `duration_ms`, `latency_breakdown.latency_retrieval_ms`, `latency_breakdown.latency_llm_ms`, plus shared context (`env`, `intent`, `preset`) | Tiles 2/3 for p50/p99, Tiles 5/6 for attribution, Alert A uses the same filters and volume gates |
| **B – Abort rate spike** | `chat_request_completed` | `aborted`, `duration_ms` (for correlation), `env`, `intent` | Tile 4 rate insight, Alert B builds the same numerator/denominator and volume gate |
| **C – Cache inefficiency (hit rate + hit/miss parity)** | `cache_decision`, `chat_request_completed` | `response_cache_hit`, `retrieval_cache_hit`, `duration_ms` split by hit/miss, shared context | Tile 7 (hit rate), Tile 8 (hit vs miss latency), Alert C-1/C-2 implement these comparisons |

## Fixes delivered by this change

- Step 1 now houses a complete alert contract, including per-alert intent, signal source, dashboard callouts, baselines, severity matrices, dependency rules, common causes, and immediate actions (`docs/telemetry/langfuse-alert.md`), which ties directly to Steps 2–3.
- Step 2’s mapping now lists every canonical PostHog event, the shared context fields, normalization rules, and the `response_cache_hit` / `retrieval_cache_hit` props that Step 3 references (see `docs/telemetry/langfuse-posthog-mapping.md`).
- Step 3 explains how dashboards (Tiles 1–8) and Alerts A/B/C consume those signals, enforces the volume/window/cooldown constraints, and documents the PostHog fallback for the hit/miss percentile comparison (`docs/telemetry/posthog-alerts.md`).

## Remaining gaps

- **P0 / Platform** – The canonical signals listed in Step 2 (`chat_request_completed`, `cache_decision`, `latency_breakdown`) currently only appear in documentation. A code-level PostHog instrumentation pass is still required to emit those events, including `duration_ms`, `aborted`, `response_cache_hit`, `retrieval_cache_hit`, `latency_retrieval_ms`, and `latency_llm_ms` so Steps 1–3 can actually run (code follow-up: implement these captures in the Langfuse → PostHog pipeline, e.g., the telemetry exporter for knowledge requests).
- **P1 / Platform** – PostHog cannot natively compare hit vs miss percentiles; a derived insight or custom helper (eg. nightly job or derived event) must materialize `p50_hit` and `p50_miss` so Alert C-2 can page automatically instead of relying solely on Tile 8 diagnostics.
- **P2 / Platform** – Validate that every `chat_request_completed` and `cache_decision` export carries `response_cache_hit` / `retrieval_cache_hit` as defined in Step 2 (Platform instrumentation); missing values would break Alert C.

## Prioritized TODO

- **P0 – Implement the canonical PostHog events** (`docs/telemetry/langfuse-posthog-mapping.md#event-1` etc)  
  Platform instrumentation must capture `chat_request_completed`, `cache_decision`, and `latency_breakdown`, wiring the listed properties before any dashboard or alert can operate reliably.
- **P1 – Create the hit/miss latency ratio signal** (`docs/telemetry/posthog-alerts.md#c-2-cache-hit-latency-not-better-than-miss`)  
  Deliver a PostHog insight, derived event, or external job that produces `p50(duration_ms | response_cache_hit=true)` vs `p50(duration_ms | response_cache_hit=false)` so Alert C-2 can trigger without manual comparison.
- **P2 – Sync Step 1 actions with the on-call runbook** (`docs/telemetry/langfuse-alert.md` vs `docs/telemetry/oncall-runbook.md`)  
  As Step 4 matures, keep the “Immediate Actions” and “Dependency rules” sections aligned with the runbook’s playbooks and tooling references.
