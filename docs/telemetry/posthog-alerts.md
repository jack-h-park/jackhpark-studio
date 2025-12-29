---
# Step 3 — PostHog Alerts + Dashboards (Design & Implementation Guide)

This phase turns the Step 2 mapping into **operational dashboards and alerts** in PostHog.

**Audience**: Infra / Platform / On-call  
**Goal**: Implement Alert A/B/C and build a compact dashboard that mirrors the intent of Dashboard C (platform health) using PostHog primitives.

> Source of truth for “what to alert on” remains `langfuse-alert.md`.  
> This doc explains **how to implement those alerts** in PostHog and how to visualize supporting context.

## How these docs relate

- Step 1 (`langfuse-alert.md`) defines the canonical alerts wired below; do not invent new signal definitions or baselines without revisiting that spec.
- Step 2 (`langfuse-posthog-mapping.md`) describes the exact PostHog event and property names used here; every reference to `chat_request_completed`, `cache_decision`, or `latency_breakdown` should match that catalog.
- Step 4 (on-call runbook) will link into the dashboards and alerts in this document for first-response guidance.

---

## Preconditions

Before building anything, verify:

1. PostHog is receiving events:
   - `chat_request_completed`
   - `retrieval_evaluated`
   - `auto_triggered`
   - `cache_decision`
   - `latency_breakdown`

2. Shared properties exist on all events:
   - `request_id`, `env`, `intent`, `preset`, `model`, `timestamp`

3. Traffic volume is non-trivial (recommended):
   - ≥ 50 knowledge requests / hour in the target environment

If any of the above is false, fix ingestion/export first.

---

## PostHog Dashboard: “Platform Health (RAG)”

Build a single dashboard with **8 tiles**. Keep it small; alerts will handle paging.
Every tile below references the event/property names enumerated in Step 2; do not substitute different signals.

### Tile 1 — Knowledge Volume

- **Type**: Trend (count)
- **Event**: `chat_request_completed`
- **Filter**: `intent = "knowledge"`
- **Breakdown**: `env` (optional)
- **Why**: denominator / alert gating

### Tile 2 — End-to-End Latency p50

- **Type**: Trend (aggregation on numeric property)
- **Event**: `chat_request_completed`
- **Property**: `duration_ms`
- **Aggregation**: p50
- **Filter**: `intent="knowledge"`
- **Why**: baseline latency

### Tile 3 — End-to-End Latency p99

- Same as Tile 2, but **p99**
- **Why**: Alert A supporting context

### Tile 4 — Abort Rate

- **Type**: Trend (formula)
- **Numerator**: count of `chat_request_completed` where `aborted=true` AND `intent="knowledge"`
- **Denominator**: count of `chat_request_completed` where `intent="knowledge"`
- **Display**: percentage
- **Why**: Alert B supporting context

### Tile 5 — LLM Latency p95

- **Type**: Trend
- **Event**: `latency_breakdown`
- **Property**: `latency_llm_ms`
- **Aggregation**: p95
- **Filter**: `intent="knowledge"`
- **Why**: isolate provider/model issues

### Tile 6 — Retrieval Latency p95

- **Type**: Trend
- **Event**: `latency_breakdown`
- **Property**: `latency_retrieval_ms`
- **Aggregation**: p95
- **Filter**: `intent="knowledge"`
- **Why**: isolate vector DB / reranker issues

### Tile 7 — Response Cache Hit Rate

- **Type**: Trend (formula)
- **Numerator**: count of `cache_decision` where `response_cache_hit=true` AND `intent="knowledge"`
- **Denominator**: count of `cache_decision` where `intent="knowledge"`
- **Display**: percentage
- **Why**: cost + latency lever

### Tile 8 — Cache Inefficiency Proxy (Hit vs Miss Latency Delta)

- **Type**: Trend (formula on medians)
- **Compute**:
  - `p50(duration_ms | response_cache_hit=true) / p50(duration_ms | response_cache_hit=false)`
- **Event(s)**: `chat_request_completed` joined by filters (build as two series, then formula if PostHog supports)
- **Why**: Alert C supporting context

> If PostHog cannot express Tile 8 as a single formula, keep it as two adjacent tiles:
> “Cache Hit p50 latency” and “Cache Miss p50 latency”.

---

## Alert Implementation Strategy (PostHog)

PostHog alerts typically attach to an Insight/Query and evaluate on a schedule.
To keep alerts actionable:

- **Use environment scoping**: create separate alerts for `env=prod` vs `env=staging`
- **Add minimum volume gating** to prevent noise
- **Deduplicate** with cool-down windows
- Prefer **ratio-based** alerts over raw counts

---

## Alert A — End-to-End Latency (p99) Regression (P1)

### Query (Insight)

- Event: `chat_request_completed`
- Filter: `intent="knowledge"` and `env=<target>`
- Metric: `duration_ms` aggregated as **p99**
- Interval: 1 minute or 5 minutes (choose based on traffic)

#### Scope & Volume Gate

- Execute one alert per environment (`env=prod`, `env=staging`, etc.) to avoid cross-noise paging.
- Require ≥ 30 knowledge requests within the 5-minute evaluation window; scale upward for prod traffic.
- Confirm that `chat_request_completed` emits `duration_ms` every minute before enabling automated paging.

### Condition

Trigger when:

- p99 > 2× baseline for ≥ 5 minutes

### Baseline Options (choose one)

**Option 1 (recommended): Static SLO baseline**

- Define an SLO per environment (e.g., prod p99 ≤ 12s)
- Trigger if p99 > 24s for 5 minutes

**Option 2: Rolling baseline**

- Baseline = rolling median of the last 24h (computed outside PostHog)
- PostHog alert evaluates against the periodically updated threshold value

> If PostHog cannot compute “2× rolling baseline” natively, use Option 1 for paging alerts and keep Option 2 as an analyst workflow.

### Noise Controls

- Minimum volume: require ≥ 30 requests in the 5-minute window (higher counts for prod traffic).
- Dedup / cooldown: suppress repeat pages for 30 minutes unless severity triples (p99 ≥ 3× baseline).
- Use PostHog dedup keys that include `env` + `preset` for clearer routing when multiple presets share the same baseline.

### Escalation Notes

- If Alert B is also firing, treat the incident as a combined latency-abort incident and route to on-call immediately.
- If Alert C fires simultaneously, recognize cache churn as an amplifier for latency and attach both alerts' payloads.
- Keep a link to Tile 5/6 (latency breakdown) handy so responders can judge retrieval vs LLM contributions fast.

### Payload / Context to include

- current p99 and 15m trend
- env, preset breakdown link (if available)
- tie-breaker: Tile 5/6 to attribute cause

---

## Alert B — Abort Rate Spike (P1)

### Query (Insight)

- Build a **rate** insight:
  - numerator: `chat_request_completed` where `aborted=true`
  - denominator: `chat_request_completed`
- Filters: `intent="knowledge"`, `env=<target>`
- Interval: 5 minutes

#### Scope & Volume Gate

- Scope the alert per environment (`env=prod`, `env=staging`) to avoid cross-traffic noise.
- Require the denominator to be ≥ 100 knowledge requests per 10 minutes (tune lower only when volume is scarce, but document the trade-off).
- Ensure `chat_request_completed.aborted` is populated for every knowledge completion before enabling the alert.

### Condition

Trigger when:

- abort_rate > 5% sustained for ≥ 10 minutes

### Noise Controls

- Minimum volume: denominator ≥ 100 events / 10 minutes (increase to ≥ 200 in prod for tighter confidence).
- Cooldown: suppress additional pages for 30 minutes unless the abort rate spikes again.
- Use deduplication keys that include `env` + `preset` so related abort waves collate together.

### Escalation Notes

- If Alert A is also firing, treat the pair as a latency-driven abandonment incident and page at SEV.
- If Alert A is silent, focus on client timeouts, gateway disconnects, or stream cancellations before escalating.
- If Alert C’s cache hit rate collapse is active, include that context inside the alert payload.

### Triage Hints (in alert text)

- “If Alert A is also firing → latency-driven abandonment”
- “If Alert A is NOT firing → check client timeout/cancellation or streaming issues”

---

## Alert C — Cache Inefficiency (P2)

PostHog usually cannot compare two filtered percentiles perfectly in a single alert.
Implement cache inefficiency as **two complementary alerts** that rely on signals from Step 2.

### C-1. Cache Hit Rate Drop (P2)

**Query**

- Event: `cache_decision`
- Metric: rate = response_cache_hit true / total
- Filters: `intent="knowledge"`, `env=<target>`

#### Scope & Volume Gate

- Scope per environment and preset to keep hit-rate trends comparable.
- Require ≥ 100 cache decisions / 30 minutes so the rate calculation stays stable.
- Ensure `cache_decision.response_cache_hit` is present on every decision before enabling the alert.

### Condition

- hit_rate drops below baseline for ≥ 30 minutes (static guardrail or trailing median)

### Baseline

- static threshold (e.g., < 20%) OR
- compare to trailing 7-day median (if supported)

### Noise Controls

- Minimum volume: ≥ 100 cache decisions / 30 minutes (increase for prod to reduce false positives)
- Cooldown: suppress re-alerts for 4 hours unless hit rate recovers and then drops again
- Dedup key: include `env` + `preset` + `cache_strategy` when relevant

### Escalation Notes

- If Alert A or Alert B fires together, treat the combined signal as a higher-severity incident.
- If C-2 (latency parity) also triggered, include that context to show cache misses have become equally expensive.

### C-2. Cache Hit Latency Not Better Than Miss (P2)

**Query**

- Event: `chat_request_completed`
- Metric: p50(`duration_ms`)
- Filter A: `response_cache_hit=true`
- Filter B: `response_cache_hit=false`
- Interval: 5 minutes

#### Scope & Volume Gate

- Filter on `intent="knowledge"` and `env=<target>` so cache comparisons stay aligned with Alert A/B.
- Require ≥ 50 cache-hit and ≥ 50 cache-miss events within the 15-minute window to keep percentiles numerically stable.
- Confirm `response_cache_hit` is populated on every `chat_request_completed` event (per Step 2).

### Condition

- p50 hit latency ≥ 0.9 × p50 miss latency for ≥ 15 minutes

### Baseline

- Compare against trailing 7-day medians for hit and miss latencies, or enforce a static ceiling for hits (e.g., hits ≤ 90% of miss latency).

### Noise Controls

- Minimum volume: require ≥ 50 hit events and ≥ 50 miss events every 15 minutes
- Cooldown: suppress re-alerts for 4 hours unless the ratio worsens significantly
- Dedup key: environment + preset + `response_cache_hit`

### Implementation Notes

- If PostHog cannot do the hit vs miss comparison in one alert, rely on C-1 for paging and use Tile 8 (or the pair of hit/miss latency tiles) as the diagnostic proof for C-2.
- Link to `latency_breakdown` tiles (Tile 5/6) to ensure retrieval vs LLM anomalies are exposed when cache parity triggers.

---

## Recommended Dedup & Routing

| Alert                  | Severity | Notify         | Cooldown |
| ---------------------- | -------- | -------------- | -------- |
| A (p99 regression)     | P1       | Pager + Slack  | 30m      |
| B (abort spike)        | P1       | Pager + Slack  | 30m      |
| C (cache inefficiency) | P2       | Slack + Ticket | 4h       |

**Escalation**

- If A and B fire together → treat as incident (SEV)
- If only C fires → schedule investigation; do not page

---

## Threshold Tuning Checklist

When adjusting thresholds, always document:

- environment (prod/staging/dev)
- time window
- minimum volume gate
- false-positive examples and why they happened
- expected effect on paging frequency

---

## Output of Step 3

At the end of this phase, you will have:

- a compact PostHog “Platform Health (RAG)” dashboard
- PostHog alerts implementing Alert A/B/C (with noise controls)
- a stable operational foundation for on-call

---

## Next Step

**Step 4 — On-call Runbook**  
Codifies playbooks for each alert with links to Langfuse + PostHog dashboards and first-response actions.

---

## End of Step 3.
