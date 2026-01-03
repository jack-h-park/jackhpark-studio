# Telemetry docs

This directory documents the **end-to-end telemetry and alerting model** for the system.

The docs are organized around a deliberate separation of concerns:

- **Intent & contracts** (what we want to detect and why)
- **Signals & mappings** (what telemetry exists and how it is normalized)
- **Tool-specific realization** (how PostHog and Langfuse consume those signals)

This structure avoids coupling operational intent to any single observability tool.

## Alert lifecycle (A/B/C)

This space treats alerts as first-class contracts:

- **A — p99 End-to-End Latency Regression (P1)**: tail latency guardrail for user experience.
- **B — Knowledge Abort Spike (P1)**: confirms user-visible failures correlated with latency.
- **C — Cache Inefficiency (P2, documented-only)**: detects silent regressions where cache provides no benefit.

Canonical semantics (e.g., `latency_ms` as handler E2E duration; deterministic booleans for `response_cache_hit` / `retrieval_cache_hit` and their `*_enabled` flags) are defined in `alerting-contract.md` and must be kept in sync with code.

## How to use this space

1. Start with `alerting-contract.md` to understand _why_ each alert exists, which signals it depends on, and how operators are expected to react.
2. Continue to `posthog-ops.md` to see _how_ those signals are implemented in PostHog dashboards and alerts, including plan limitations and fallbacks.
3. Use the remaining documents for deeper diagnostics, operational playbooks, Langfuse-specific dashboards, and audit history.
4. Read `../product/telemetry-to-product.md` when you need the product interpretation layer: telemetry defines the signals, the product docs explain how to reason about them and take action.

## Canonical documents

- `alerting-contract.md` — consolidates Step 1 (alert intent/spec) and Step 2 (canonical events, properties, normalization) into a single operator-facing contract.
- `posthog-ops.md` — PostHog dashboards, alert implementation notes (intervals, volume gates, cooldowns), and the cache hit/miss fallback.
- `langfuse-dashboard.md` — explains the Langfuse-side dashboards and their A/B/C layout (unchanged except for updated cross-links).
- `oncall-runbook.md` — the incident playbooks for Alerts A, B, and C.
- `rag-observations.md` — field-by-field reference for `rag:root` and `context:selection` observations.
- `telemetry-logging.md` — logging and Langfuse telemetry architecture.
- `langfuse-guide.md` — payload formats, tags, and generation summaries sent to Langfuse.
- `audit.md` — current audit status, fixed documentation touches, and outstanding Platform/Product work.

## How these docs relate to dashboards

- **Langfuse dashboards** visualize raw and derived signals at trace and observation level.
- **PostHog dashboards** aggregate a normalized subset of those signals for operational trends and alerts.
- **This documentation layer** explains the _meaning_, _dependencies_, and _expected behavior_ behind those dashboards.
- **Alerts consume dashboards**: Alerts A/B/C are evaluated against specific dashboard tiles; dashboards should change only after the corresponding contract/ops docs are updated.

If a dashboard changes, the corresponding contract or ops doc should be updated first.

## Next steps

- When you need to check whether an alert is healthy, start with `posthog-ops.md` and the dashboard tiles it references.
- When updating instrumentation, sync the code change with the canonical signal tables in `alerting-contract.md`.
- If you spot a doc drift, update `audit.md` so the TODO list stays actionable.
