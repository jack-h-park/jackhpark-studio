> ⚠️ **Legacy Notice**  
> This document is superseded by `docs/telemetry/alerting-contract.md`, which is the canonical, tool-agnostic alert contract.  
> This file is retained for historical reference only.

# Langfuse Alert Specification

This document defines **what should alert and why**, not how alerts are configured in a specific UI.  
It is the canonical alert contract for the system.

**Audience**  
Infra / Platform / On-call Engineers

**Scope**  
Langfuse-based operational alerts derived primarily from Dashboard C.  
This document specifies _what to alert on and why_.  
Implementation details (UI clicks, webhooks, integrations) are intentionally deferred to later phases.

---

## Alerting Philosophy

- Alerts should represent **actionable user risk**, not metric noise
- Every alert must answer:
  - _What is broken?_
  - _Who is impacted?_
  - _What should the on-call engineer check first?_
- Alerts are evaluated against **knowledge traffic only**, unless explicitly stated

---

## Alert Group A — End-to-End Latency (p99 Regression)

**Intent**  
Detect critical regressions in tail latency that directly degrade user experience.

**Signal Source**  
Dashboard C — p99 latency metric (C-1c), scoped to `intent = knowledge`.

**Alert Condition**  
Trigger when the p99 latency exceeds **2× the baseline** for **≥ 5 minutes**, or the absolute p99 latency surpasses an environment-specific threshold.  
Baseline is defined as either the rolling median of the last 24 hours or a static SLO, whichever is more appropriate.

**Severity**  
P1 — High priority due to critical tail-latency impact on user experience.

**Why p99?**  
The p99 latency captures the worst-case user experience, which correlates strongly with user complaints and perceived performance degradation. Average latency metrics often mask tail latency issues.

**Common Root Causes**

- Retrieval slowness due to index growth or cold caches
- LLM provider throttling or rate limiting
- Oversized prompts or context windows causing processing delays

**Immediate Actions**

1. Review Dashboard C — p99 latency (C-1c) trends and anomalies
2. Compare retrieval latency against LLM latency splits to isolate bottlenecks
3. Check for recent deployments or configuration changes that might affect latency

---

## Alert Group B — Abort Rate (User-Abandoned Requests)

**Intent**  
Detect spikes in user-abandoned requests indicating degraded user experience or client-side issues.

**Signal Source**  
Dashboard C — Abort rate metric (C-4), scoped to `intent = knowledge`.

**Alert Condition**  
Trigger when abort rate exceeds **5%** for **≥ 10 minutes** during knowledge traffic.

**Severity**  
P1 — High priority due to direct impact on user experience.

**Why Abort Rate Matters**  
Elevated abort rates indicate users are abandoning requests, often due to slow responses or errors, signaling a failure in delivering expected service.

**Common Root Causes**

- Backend timeouts or slow responses
- Client-side issues causing premature cancellations
- Network instability or connectivity problems

**Immediate Actions**

1. Correlate abort spikes with Alert Group A latency issues
2. Investigate client logs and frontend error rates
3. Review recent changes impacting request handling or network stability

---

## Alert Group C — Cache Inefficiency (Hit ≈ Miss Latency)

**Intent**  
Identify cache inefficiency where cache hit latency approaches or matches miss latency, indicating ineffective caching.

**Signal Source**  
Dashboard C — Cache hit and miss latency metrics (C-5a and C-5b).

**Alert Condition**  
Trigger when the p50 cache hit latency is greater than or equal to 0.9 × p50 cache miss latency for **≥ 15 minutes**.

**Note**  
Depending on the observability tooling in use, this alert may require derived signals or manual correlation when native percentile comparisons are not supported.

**Severity**  
P2 — Medium priority due to performance degradation and increased cost impact.

**Why This Matters**  
Inefficient caching leads to unnecessary backend load and higher latency, degrading performance and increasing operational costs.

**Common Root Causes**

- Cache configuration errors or stale entries
- Backend performance regressions affecting cache retrieval
- Changes in query patterns reducing cache effectiveness

**Immediate Actions**

1. Correlate cache inefficiency with Alert Group A latency regressions
2. Review cache hit/miss ratios and eviction policies in Dashboard A
3. Investigate recent deployments or configuration changes affecting caching

---

| Alert | Signal             | Severity | User Impact                   |
| ----- | ------------------ | -------- | ----------------------------- |
| A     | p99 latency        | P1       | Critical UX degradation       |
| B     | Abort rate         | P1       | Confirmed user abandonment    |
| C     | Cache inefficiency | P2       | Cost + performance regression |

---

## Alert Dependencies & Correlation Rules

- Never act on Alert Group C alone; always correlate with Alert Group A to confirm impact.
- Alert Group B without Alert Group A generally indicates frontend or client-side issues.
- Alert Group A without Alert Group B, especially if short-lived, should be monitored as it may self-resolve without user impact.

---

## Design Principles

- Alerts are comparative rather than absolute, focusing on deviations from baseline or expected behavior.
- Alerts apply only to knowledge traffic to reduce noise and improve relevance.
- Observability coverage, as tracked in Dashboard C-6, is a mandatory prerequisite for alert reliability.
- If Dashboard C-6 telemetry is broken or incomplete, disable alerts and prioritize fixing telemetry before re-enabling.

---

## Output of Step 1

At the end of this phase, the system has:

- Clear alert intent
- Explicit thresholds and baselines
- Defined severity levels
- Actionable, first-step diagnostics
- Cross-alert reasoning rules

Subsequent phases will map these alert definitions to:

- Langfuse / PostHog events
- Notification channels
- On-call runbooks
