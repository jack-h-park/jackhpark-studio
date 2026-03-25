# Telemetry docs

> **Derives from canonical:** [Telemetry alerting contract](../canonical/telemetry/alerting-contract.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

This directory documents the **end-to-end telemetry and alerting model** for the system. Read it by role:

- **Canonical**: the stable contract and field semantics
- **Operational/default**: the docs you should usually open when auditing telemetry or responding to issues
- **Historical/reference**: dashboards, audit history, and background material that should not be the first thing a skill reads by default

## Alert lifecycle (A/B/C)

This space treats alerts as first-class contracts:

- **A — p99 End-to-End Latency Regression (P1)**: tail latency guardrail for user experience.
- **B — Knowledge Abort Spike (P1)**: confirms user-visible failures correlated with latency.
- **C — Cache Inefficiency (P2, documented-only)**: detects silent regressions where cache provides no benefit.

Canonical semantics (e.g., `latency_ms` as handler E2E duration; deterministic booleans for `response_cache_hit` / `retrieval_cache_hit` and their `*_enabled` flags) are defined in `alerting-contract.md` and must be kept in sync with code.

## Read by default

1. **Canonical**
   - [`alerting-contract.md`](../canonical/telemetry/alerting-contract.md)
2. **Operational/default**
   - [`operations/telemetry-audit-checklist.md`](operations/telemetry-audit-checklist.md)
   - [`implementation/telemetry-logging.md`](implementation/telemetry-logging.md) when wiring or env behavior matters
   - [`runbooks/oncall-runbook.md`](runbooks/oncall-runbook.md) when an alert is active
3. **Historical/reference**
   - open only if the task specifically needs dashboard shape, audit history, or prior implementation rationale

## Document roles

### Canonical
- [`alerting-contract.md`](../canonical/telemetry/alerting-contract.md) — the source of truth for alert intent, event names, property semantics, normalization, and invariants.

### Operational/default
- [`operations/telemetry-audit-checklist.md`](operations/telemetry-audit-checklist.md) — default operational checklist for telemetry audits.
- [`implementation/telemetry-logging.md`](implementation/telemetry-logging.md) — logging and telemetry wiring, merge rules, env knobs, and shared helper behavior.
- [`runbooks/oncall-runbook.md`](runbooks/oncall-runbook.md) — first-response playbooks for A/B/C alerts.
- [`implementation/rag-observations.md`](implementation/rag-observations.md) — default reference when the task is about `rag:root` or `context:selection`.

### Historical / reference context
- [`posthog-ops.md`](posthog-ops.md) — dashboard and alert realization details; useful when implementing or tuning PostHog, not the default first read for a contract audit.
- [`langfuse-guide.md`](langfuse-guide.md) — detailed payload shape and dashboard usage; useful when trace-level detail is needed.
- [`dashboards/langfuse-dashboard.md`](dashboards/langfuse-dashboard.md) and [`dashboards/posthog-dashboard.md`](dashboards/posthog-dashboard.md) — dashboard interpretation/reference.
- [`audit.md`](audit.md) — telemetry doc history and open gaps.

## Selection rules

- Open the canonical contract first when checking whether a field or event is correct.
- Open the operational checklist first when running a telemetry audit.
- Open dashboard docs only when the task is explicitly about dashboard behavior, alert implementation, or observability interpretation.
- Open audit-history docs only when you need background on why the current telemetry model was shaped the way it is.

## How these docs relate to dashboards

- **Langfuse dashboards** visualize raw and derived signals at trace and observation level.
- **PostHog dashboards** aggregate a normalized subset of those signals for operational trends and alerts.
- **This documentation layer** explains the _meaning_, _dependencies_, and _expected behavior_ behind those dashboards.
- **Alerts consume dashboards**: Alerts A/B/C are evaluated against specific dashboard tiles; dashboards should change only after the corresponding contract/ops docs are updated.

If a dashboard changes, the corresponding contract or ops doc should be updated first.

## Next steps

- When updating instrumentation, sync the code change with the canonical signal tables in `alerting-contract.md`.
- When running a telemetry audit, start with `operations/telemetry-audit-checklist.md`.
- When responding to an active alert, start with `runbooks/oncall-runbook.md`.
- If you spot a doc drift, update `audit.md` so the TODO list stays actionable.
