# Langfuse Alert Specification

This document defines **what should alert and why**, not how alerts are configured in a specific UI.  
It is the canonical alert contract for the system and drives Steps 2–4 of the telemetry workflow.

## How these docs relate

- Step 1 (this document) captures the **operational intent** for each alert; Step 2 must deliver the event/property taxonomy listed below before any alert fires.
- Step 2 (`langfuse-posthog-mapping.md`) is the **source of truth for signal names** referenced here; any change to those signals needs a Step 1 review.
- Step 3 (`posthog-alerts.md`) consumes these signals to build dashboards and alerts; it must not invent new telemetry or redefine baselines without revisiting this contract.

## Observability prerequisites

1. Langfuse exports the following PostHog events (and properties) for knowledge traffic:
   - `chat_request_completed` → `duration_ms`, `aborted`, `response_cache_hit`, `retrieval_cache_hit`
   - `cache_decision` → `response_cache_hit`, `retrieval_cache_hit`, `cache_strategy`
   - `latency_breakdown` → `latency_total_ms`, `latency_retrieval_ms`, `latency_llm_ms`
2. All events carry `env`, `intent=knowledge`, `request_id`, and `timestamp`; alerts only evaluate knowledge traffic.
3. Minimum signal volume per environment is adopted before paging: see each alert’s prerequisites below (roughly ≥30 requests / 5m for latency, ≥100 requests / 10m for aborts, ≥100 cache decisions / 30m for cache signals).

---

## Alert Group A — Latency (User-Perceived Performance)

### A-1. End-to-End p99 Latency Regression

**Intent**  
Capture degradations of the worst-case user experience on knowledge requests.

**Signal Source**  
- `chat_request_completed.duration_ms` aggregated to p99
- `latency_breakdown` for attribution (retrieval vs LLM)

**Trigger Condition**
- `intent=knowledge`, `env=<target>`
- p99 > **2× baseline** for ≥ 5 minutes **OR** absolute p99 > environment threshold (e.g., `> 24s` in prod)

**Baseline**
- Preferred: static SLO baseline per environment (prod p99 ≤ 12s, staging ≤ 18s).
- Optional: rolling baseline derived from trailing 24h median (hosted outside PostHog) that feeds into configurable thresholds.

**Severity Matrix**

| Severity | Condition | Response |
| -------- | --------- | -------- |
| P1 | p99 ≥ 2× baseline for 5m | Page immediately, treat as incident, include Step 3 dashboards in alert text |
| P2 | p99 exceeds baseline for 10m but stays <2× baseline | Investigate and document impact; do not page unless repeated |

**Correlation Rules**
- If Alert B (abort spike) fires simultaneously, prioritize latency throttling as the root cause.
- If Alert B is silent, suspect provider-side throttling, OOMs, or upstream network noise.
- Use `latency_breakdown` to correlate retrieval vs LLM tail contributions and to seed Alert C diagnostics.

**Prerequisites**
- `chat_request_completed` event must be complete every minute with `duration_ms`, `env`, `intent`, and request metadata.
- Volume gate: ≥ 30 knowledge requests within the 5m evaluation window (higher in low-volume environments).
- Observability: `latency_breakdown` data available for the same time window to rule out caching effects.

**Immediate Actions**
1. Confirm whether recent deployments/LLM provider changes align with the regression window.
2. Compare retrieval (`latency_breakdown.latency_retrieval_ms`) vs LLM (`latency_breakdown.latency_llm_ms`) tail to isolate the feeder.
3. Validate the baseline currently driving the alert (static SLO or rolling median); adjust if outdated.

---

## Alert Group B — Abort Rate Spike (User Abandonment)

### B-1. Abort Rate Spike

**Intent**  
Detect surges in user-initiated cancellations or mid-stream failures that leave knowledge requests incomplete.

**Signal Source**  
- `chat_request_completed.aborted` toggles aggregated over `intent=knowledge`
- `chat_request_completed.duration_ms` to gauge whether aborts correlate with latency

**Trigger Condition**
- abort rate ≥ **5%** for ≥ 10 minutes **AND** denominator ≥ 100 knowledge requests per 10m

**Baseline**
- 5% abort rate is the operational baseline; any sustained deviation above this value for 10m is actionable.
- Adjust using a rolling 7-day median (recomputed weekly) when the platform footprint shifts significantly.

**Severity Matrix**

| Severity | Condition | Response |
| -------- | --------- | -------- |
| P1 | abort rate ≥ 5% for ≥ 10m with ≥ 100 requests | Page with high priority and run the latency-abort correlation checklist |
| P2 | abort rate between 3–5% or denominator < 100 but trending up | Flag for investigation; monitor next 2h before paging |

**Correlation Rules**
- If Alert A is also firing, treat the abort spike as a latency-driven abandonment incident.
- If Alert A is quiet, focus on client-side timeouts, stream cancellations, and gateway errors rather than LLM latency.
- When Alert C shows cache hit latency parity, expect B to increase; treat them as a shared degradation scenario.

**Prerequisites**
- `chat_request_completed.aborted` must be emitted with every knowledge request completion.
- Volume gate: denominator ≥ 100 requests / 10m per environment (scale threshold for low-volume envs but note noise risk).
- Ensure `env` tagging is reliable so staging/prod scope stays separate.

**Immediate Actions**
1. Pull the abort rate trend alongside latency (p99/p50) to determine if latency drove cancellations.
2. Inspect client timeout settings, streaming disconnects, and gateway logs for spikes matching the alert window.
3. If `response_cache_hit=false` is dominant, escalate to Alert C diagnostics before paging further.

---

## Alert Group C — Cache Inefficiency (Cost + Latency Lever)

### C-1. Cache Hit Rate Collapse

**Intent**  
Detect when retrieval caches stop serving hits, increasing cost and latency for knowledge traffic.

**Signal Source**  
- `cache_decision.response_cache_hit` and `cache_decision.retrieval_cache_hit` per knowledge request
- `env`, `intent`, `preset`

**Trigger Condition**
- hit rate falls below **static threshold (e.g., 20%)** for ≥ 30 minutes **OR**
- hit rate drops by ≥ 20% vs trailing 7-day median for ≥ 30 minutes

**Severity Matrix**

| Severity | Condition | Response |
| -------- | --------- | -------- |
| P2 | hit rate < 20% (or 20% drop vs median) for 30m with ≥ 100 cache decisions | Open P2 ticket, notify platform team, do not page unless correlated with Alert A |
| P3 | hit rate dip < 20% but < 30m | Monitor and document root cause updates |

**Correlation Rules**
- If Alert A fires concurrently, the cache hit collapse likely amplifies latency; escalate to “incident” posture.
- If Alert B also fires, treat the cache gap as a contributor to user abandonment.

**Prerequisites**
- `cache_decision` events must include `response_cache_hit`, `retrieval_cache_hit`, and `cache_strategy`.
- Volume gate: ≥ 100 cache decisions / 30m per environment.
- Alert C depends on the `intent=knowledge` filter to avoid chitchat noise.

**Immediate Actions**
1. Confirm backend cache connectivity (vector DB, retriever) and any misconfigured TTLs.
2. Compare current hit vs miss rates to recent baselines reported by Langfuse.
3. If hits drop only for specific `preset`, flag the cache configuration change.

### C-2. Cache Hit Latency Approaches Miss Latency

**Intent**  
Detect when cached responses no longer deliver a latency advantage over cache misses, wiping out the cost/latency benefit.

**Signal Source**
- `chat_request_completed.duration_ms` with `response_cache_hit` metadata on every request (knowledge traffic)
- `latency_breakdown` to validate the broader latency behavior

**Trigger Condition**
- p50 latency for `response_cache_hit=true` ≥ 0.9 × p50 latency for `response_cache_hit=false`
- Condition persists for ≥ 15 minutes with ≥ 50 hit and 50 miss events in the window

**Baseline**
- Compare to trailing 7-day p50 hit/miss medians (non-PostHog external process) or enforce static guardrails (e.g., hits ≤ 90% of miss latency).

**Severity Matrix**

| Severity | Condition | Response |
| -------- | --------- | -------- |
| P2 | hit latency ≥ 0.9× miss latency for 15m with stable volume | Notify platform + cost teams; escalate if latency alert (A) is also active |
| P3 | sub-second variance spike (<0.9× but trending upward) | Monitor before raising to paging awareness |

**Correlation Rules**
- If Alert A fires simultaneously, treat cache latency parity as an accelerant, not the root cause.
- If miss latency increases while hits stay constant, focus on data source regressions (vector DB, rerankers).

**Prerequisites**
- `chat_request_completed.response_cache_hit` must be recorded on every event.
- Demand gating: ≥ 50 cache hits and 50 misses per 15m window to keep the ratio stable.
- Synchronized timestamps across `cache_decision` and `chat_request_completed` to align hit/miss comparisons.

**Immediate Actions**
1. Drill into Step 2’s `latency_breakdown` to separate retrieval vs LLM contributions for the hit/miss groups.
2. Review cache inefficiency alerts (C-1) and any recent cache configuration changes.
3. If the cache hit latency penalty originates from a specific `model` or `preset`, tag the alert text to accelerate triage.

---

## Additional guidance

- Always tag alerts with `env`, `intent`, and `preset` so downstream dashboards can auto-scope.
- Document when you switch from a static baseline to a rolling one, including the data source for the rolling value.
- If any required signal flows stop (e.g., `latency_breakdown` disappears), pause the alert and raise an observability ticket before relying on stale data.
