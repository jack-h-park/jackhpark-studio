# Telemetry alerting contract

## Canonical Contract

**Status:** Canonical  
**Defines:**
- the alert signal contract (intent → signal → action) for latency, abort, and cache efficiency alerts.
- the canonical PostHog/Langfuse event/property semantics (names, payload shapes, required fields).
- the escalation philosophy and operational guidance that keep dashboards aligned with the contract.
**Invariants:**
- Metric and alert names must remain stable so dashboards, alerts, and runbooks continue to work.
- This document stays the single source of truth for signal semantics before any downstream guide changes.
- Required fields (`latency_ms`, `aborted`, `response_cache_hit`, `rag_enabled`, etc.) must keep their documented boolean/number semantics.
**Derived documents:**
- [posthog-ops.md](./posthog-ops.md)
- [dashboards/posthog-dashboard.md](./dashboards/posthog-dashboard.md)
- [dashboards/langfuse-dashboard.md](./dashboards/langfuse-dashboard.md)
- [langfuse-guide.md](./langfuse-guide.md)
- [implementation/telemetry-logging.md](./implementation/telemetry-logging.md)
- [runbooks/oncall-runbook.md](./runbooks/oncall-runbook.md)
- canonical playbook `jackhpark-ai-skills/playbooks/telemetry-operational-verification.md`
- [../operations/telemetry-operational-verification-local.md](../operations/telemetry-operational-verification-local.md)
**Change rule:** If this contract changes, update derived docs in the same PR.

## How these docs relate
- **Spec** → `alerting-contract.md` houses the intent, trigger conditions, severity matrices, dependency rules, and immediate actions for every canonical alert (Steps 1 & 2 rolled into a single contract).
- **Mapping** → The same doc also spells out the canonical PostHog events/properties you are allowed to reference (Step 2). Changes to the spec or event names must stay in sync here.
- **Implementation** → `posthog-ops.md` is the PostHog-specific realization (Step 3). It must never invent telemetry outside the signals defined in this file.

## Observability prerequisites
1. The app emits a single PostHog event per request via `captureChatCompletion` (`lib/analytics/posthog.ts`); all alert signals are sourced from its properties. Latency and cache attribution live on the same event rather than as separate event types:
   - `chat_completion` with `latency_ms`, `aborted`, `response_cache_hit`, `retrieval_cache_hit`, `status`, `total_tokens`, `error_type`, `preset_key`, and the shared context fields listed below.
   - **Latency attribution** — `latency_retrieval_ms` and `latency_llm_ms` (the retrieval-vs-LLM split) ride on `chat_completion`; there is no separate `latency_breakdown` event.
   - **Cache attribution** — `response_cache_hit`, `retrieval_cache_hit`, and `cache_strategy` (`early`/`late`/null) ride on `chat_completion`; there is no separate `cache_decision` event.
2. All `chat_completion` events carry `env`, `request_id`, and `preset_key`. `intent` is not emitted as a property — PostHog lacks an `intent` filter, so use `rag_enabled=true` as the production proxy for `intent=knowledge` whenever you build insights or alerts.
3. Volume gates are required before paging: latency alerts need ≥ 30 requests per 5m, aborts ≥ 100 requests per 10m, and cache diagnostics ≥ 100 cache decisions per 30m.
4. Langfuse sampling/drop filters keep chitchat out of these signals, so the alerts only fire on knowledge traffic.

## Canonical metric semantics
- `latency_ms` measures handler entry → request completion (the same `startTime` tracked in the LangChain handler).
- `response_cache_hit` / `retrieval_cache_hit` are **always booleans** inside PostHog; missing or disabled caches appear as `false`.
- `response_cache_enabled` / `retrieval_cache_enabled` indicate whether the respective cache was configured and are also booleans, independent of hit flags.
- Legacy/trace-only cache flags (e.g., Langfuse `metadata.cache` detail) are not consulted by PostHog alerts; rely on the canonical boolean properties above.

---

## Step 1 — Alert specifications (Intent → Signal → Action Chain)

### Alert Group A — Latency (User-Perceived Performance)

**Intent**  Capture degradations of the worst-case knowledge request experience.

**Signal source**  `chat_completion.latency_ms` aggregated to the tail, with `chat_completion.latency_retrieval_ms` vs `latency_llm_ms` for attribution.

**Trigger condition**  Knowledge traffic where p99 ≥ 2× the expected baseline for 5m **OR** absolute p99 exceeds the environment threshold (prod > 24s, staging > 30s) while the volume gate is satisfied.

**Baseline**  Static SLOs per environment (prod ≤ 12s, staging ≤ 18s) or a trailing 24h median sourced outside PostHog.

**Severity matrix**

| Severity | Condition | Response |
| -------- | --------- | -------- |
| P1 | Tail ≥ 2× baseline for ≥ 5m | Page immediately with Alert A and include the Step 3 dashboard links in the description |
| P2 | Baseline exceeded for ≥ 10m but < 2× baseline | Investigate without paging; monitor the next 2h before promoting |

**Dependency & correlation rules**
- If Alert B (abort spike) fires simultaneously, latency is almost always the root cause; prioritize the A playbook.
- If Abort B is quiet, suspect provider throttling, OOMs, or network noise.
- Use `chat_completion.latency_retrieval_ms` vs `latency_llm_ms` to split retrieval vs LLM, guiding mitigations and seeding Alert C diagnostics.

**Prerequisites**
- `chat_completion` events emitted at least once per minute with `latency_ms`, `env`, `intent`, and request metadata.
- Volume gate: ≥ 30 knowledge requests in the 5m evaluation window (adjust upward for low-volume envs).
- `latency_retrieval_ms` / `latency_llm_ms` must cover the same window to exclude cache effects.

**Immediate actions**
1. Confirm the regression window against recent deployments or LLM provider changes.
2. Compare retrieval (`latency_retrieval_ms`) vs LLM (`latency_llm_ms`) tails to isolate the feeder.
3. Verify the baseline in play (static SLO vs rolling median) and refresh if stale.

**Common causes**
- Retrieval slowdowns (index growth, reranker drift, vector DB latency).
- LLM throttling, cold starts, or streaming timeouts.
- Oversized prompts/contexts that push latency above historical levels.

---

### Alert Group B — Abort Rate Spike (User abandonment)

**Intent**  Detect surges in client cancellations or stream failures that leave knowledge requests incomplete.

**Signal source**  `chat_completion.aborted=true` counts with `status` and `latency_ms` used for correlation; filters continue to scope `rag_enabled=true` and `env`.

**Trigger condition**  Abort rate ≥ 5% for ≥ 10m **AND** denominator ≥ 100 knowledge requests per 10m. When PostHog cannot express percentages, operators evaluate the abort count relative to expected volume (see `posthog-ops.md`).

**Baseline**  5% sustained abort rate is actionable; adjust using a weekly rolling median when traffic patterns change.

**Severity matrix**

| Severity | Condition | Response |
| -------- | --------- | -------- |
| P1 | Abort rate ≥ 5% for ≥ 10m with ≥ 100 requests | Page and follow the latency-abort correlation checklist |
| P2 | Abort rate 3–5% or denominator < 100 but trending upward | Flag for investigation; monitor before paging |

**Dependency & correlation rules**
- If Alert A fires too, treat aborts as latency-driven; run Playbook A first.
- If Alert A is silent, look for client timeouts, streaming disconnects, or gateway errors.
- When Alert C shows cache hit parity, expect aborts to rise as caching stops protecting users.

**Prerequisites**
- `chat_completion.aborted` present on every knowledge event, along with `status`/`env` metadata.
- Volume gate: ≥ 100 knowledge requests per 10m (lower for lower-volume envs, but be aware of noise).

**Immediate actions**
1. Compare abort trends with latency (p99/p50) to determine causality.
2. Inspect frontend timeouts, streaming buffers, and gateway logs for concurrent spikes.
3. If `response_cache_hit=false` dominates, escalate to cache diagnostics before paging further.

**Common causes**
- Client timeouts that trigger as latency crosses fixed thresholds.
- Gateway/distribution errors canceling streams mid-flight.
- Streaming interruptions or guardrails canceling inflight requests.

---

### Alert Group C — Cache inefficiency (Cost + latency lever)

**Intent**  Detect when caches no longer provide benefit—either hit rate collapses (C-1) or hit latency matches misses (C-2).

#### C-1. Cache hit rate collapse
**Signal source**  `chat_completion.response_cache_hit` (and `retrieval_cache_hit`) aggregated for `rag_enabled=true`, grouped by `preset_key`.

**Trigger condition**  Hit rate < 20% for ≥ 30m **OR** ≥20% drop vs trailing 7d median with ≥ 100 cache decisions in 30m.

**Severity matrix**
| Severity | Condition | Response |
| -------- | --------- | -------- |
| P2 | Hit rate < 20% or 20% drop vs median for 30m with ≥ 100 decisions | Open a P2 ticket and notify Platform (do not page unless paired with Alert A) |
| P3 | Hit rate dip < 20% or window < 30m | Monitor and document root causes |

**Prerequisites**
- `chat_completion` includes `response_cache_hit`, `retrieval_cache_hit`, `cache_strategy` and `env`.
- Volume gate: ≥ 100 cache decisions per 30m.
- `intent=knowledge` filter ensures chitchat is excluded.

**Immediate actions**
1. Confirm backend cache connectivity (vector DB, retriever) and TTLs.
2. Compare current hit/miss rates to recent baselines.
3. If a single `preset_key` is affected, tag the alert to speed triage.

**Common causes**
- Retrieval/backing stores down, invalidating cache lookups.
- TTL misconfig or invalidations that flush entries prematurely.
- Metadata mismatches (intent/preset) causing lookup misses.

#### C-2. Cache hit latency parity
**Signal source**  `chat_completion.latency_ms` grouped by `response_cache_hit`, plus `latency_retrieval_ms`/`latency_llm_ms` for attribution.

**Trigger condition**  p50 latency for hits ≥ 0.9 × misses for ≥ 15m with ≥ 50 hits and misses each.

**Baseline**  Compare to trailing 7d hit/miss medians (external process) or enforce static guardrails (hit latency should stay ≤ 90% of miss latency).

**Severity matrix**
| Severity | Condition | Response |
| -------- | --------- | -------- |
| P2 | Hit latency ≥ 0.9× miss latency for 15m with stable volume | Notify Platform + cost teams; escalate if Alert A also active |
| P3 | Sub-second variance spike (< 0.9× but trending upward) | Monitor closely |

**Prerequisites**
- `response_cache_hit` present on every knowledge `chat_completion` event.
- Volume gate: ≥ 50 hits and misses in a 15m window.
- Cache and latency properties ride on the same `chat_completion` event, so no cross-event timestamp alignment is needed.

**Immediate actions**
1. Use `latency_retrieval_ms`/`latency_llm_ms` to split retrieval vs LLM for both hit/miss cohorts.
2. Cross-check Alert C-1 to ensure hit-rate collapse isn’t the driver.
3. Tag the alert with `model`/`preset_key` when a single config drives the regression.

**Common causes**
- Missing instrumentation for `response_cache_hit` causing false parity signals.
- Retrieval latency regression leaking into the hit cohort due to tagging gaps.
- Shared throttling/network errors hitting both hits and misses equally.

---

## Additional guidance
- Tag every alert with `env`, `intent`, and `preset_key` so dashboards can auto-scope.
- Document every baseline change (static → rolling) and the data source for the new threshold.
- If any required signal (e.g., `latency_retrieval_ms`) disappears, pause the alert and raise an observability ticket.
- PostHog currently does not expose `intent` as a filter; rely on `rag_enabled=true` inside the platform until the filter exists.

---

## Step 2 — Canonical signal taxonomy

### Shared context (attached to every event)
| Property | Source | Notes |
| --- | --- | --- |
| `request_id` | Langfuse `requestId` | Join key across systems |
| `env` | Tag `env:*` | dev / staging / prod |
| `intent` | Langfuse intent tag | Always set to `knowledge` for these alerts; PostHog cannot filter on it yet |
| `preset_key` | Guardrails `presetKey` | Logical configuration |
| `model` | `metadata.llmResolution.resolvedModelId` | Sanitized |
| `timestamp` | Event time | Server-side |

> **Note:** PostHog currently lacks an `intent` filter, so alerts and dashboards use `rag_enabled=true` as the practical knowledge traffic proxy.

### `chat_completion`
**Purpose** Primary lifecycle event for each knowledge completion (success, abort, or error).

**Key properties**
| Property | Source |
| --- | --- |
| `latency_ms` | Handler entry → response completion latency (canonical p99 signal for Alert A). |
| `latency_llm_ms` | `answer:llm` observation |
| `latency_retrieval_ms` | Retrieval-stage latency on `chat_completion` |
| `aborted` | Completion flag |
| `response_cache_hit` | Cache metadata |
| `retrieval_cache_hit` | Cache metadata |
| `response_cache_enabled` | Whether response-level caching was enabled for this request (true/false). |
| `retrieval_cache_enabled` | Whether retrieval-level caching was enabled for this request (true/false). |
| `status` | success / error / aborted |
| `error_type` | Short classifier for failures |
| `total_tokens` | Token count for billing/cost |
| `preset_key` | Config name |
| `rag_enabled` | Backing retrieval flag |

**Used by** Alerts A/B/C for latency, abort, and hit/miss comparisons. PostHog dashboards rely on these properties for gating, filters, and dedup keys.

### Latency & cache attribution (on `chat_completion`)
There are **no separate `latency_breakdown` or `cache_decision` events**. Attribution rides on `chat_completion` so alerts need no cross-event joins. The properties below are part of the `chat_completion` payload above.

**Latency attribution** — for Alert A investigations and Alert C latency parity:
| Property | Source |
| --- | --- |
| `latency_ms` | Handler entry → completion (total) |
| `latency_retrieval_ms` | Retrieval-stage latency |
| `latency_llm_ms` | LLM generation latency (`answer:llm`) |

**Cache attribution** — for Alert C hit-rate diagnostics and cost dashboards:
| Property | Source |
| --- | --- |
| `response_cache_hit` | Cache metadata |
| `retrieval_cache_hit` | Cache metadata |
| `cache_strategy` | `early` / `late` / null (response-cache coordinator) |

### Field normalization rules
- Booleans remain booleans.
- Missing data appears explicitly as `null`, not omitted.
- Latency values are always in milliseconds.
- Score-like metrics stay normalized between 0–1.

### Data volume & sampling
- Only knowledge traffic lands in these events by default; chitchat is sampled or excluded.
- Sampling decisions are uniform across events so ratios remain stable.

### Failure handling
- PostHog export failures do not block Langfuse ingestion.
- Failures are logged; partial events are preferred over dropped requests.

### Output of Step 2
After this phase, the system has a stable event taxonomy, documented property contracts, and signal coverage for dashboards and alerts.

### Next phase
`posthog-ops.md` describes how these signals are visualized and paged inside PostHog (Step 3).
