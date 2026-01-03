# On-call Runbook (RAG Platform)

This runbook is the **Step 4 output**. It defines first-response playbooks for:

- Alert A — p99 latency regression (P1)
- Alert B — abort rate spike (P1)
- Alert C — cache inefficiency (P2)

**Primary goal**: restore user experience quickly.  
**Secondary goal**: minimize cost and prevent recurrence.

---

## Quick Start (60 seconds)

1. Confirm environment (prod vs staging) and traffic level
2. Check **observability coverage first**
   - If telemetry is missing or incomplete, treat as an observability incident
3. Identify which alert(s) are firing:
   - A only, B only, A+B, or C
4. Use the triage table below to jump to the right playbook

---

## Triage Table

| What is firing? | Most likely situation               | Go to             |
| --------------- | ----------------------------------- | ----------------- |
| Alert A only    | Tail latency spike (may self-heal)  | Playbook A        |
| Alert B only    | Client/streaming/cancellation issue | Playbook B        |
| Alert A + B     | Confirmed UX incident               | Playbook A then B |
| Alert C only    | Cost/perf regression (non-page)     | Playbook C        |

---

## Golden Rules

- **Do not tune retrieval quality** (ranking weights, thresholds) while Platform/Observability is unstable.
- **If coverage is broken, stop** and fix telemetry first; everything else becomes untrustworthy.
- Prefer **reversible mitigations** (feature flags, provider switch, cache strategy rollback) over deep changes mid-incident.

---

## Shared Checks (Do This First)

### S-1. Observability Coverage Sanity

**Why**: Missing telemetry invalidates all dashboards and alerts.

**Validate**

- In Langfuse:
  - Knowledge traces exist during the alert window
  - Expected observations exist:
    - `answer:llm` (generation)
    - `retrieval` (for knowledge)
- In PostHog:
  - Incoming events in the last 15 minutes:
    - `chat_completion`
    - `cache_decision`
    - `latency_breakdown`

**If broken**

- Declare “Observability degradation”
- Pause any tuning decisions
- Fix export/ingestion wiring and re-check

---

### S-2. Minimum Volume Gate

**Why**: Low volume creates noisy percentiles and unstable ratios.

**Rule of thumb**

- For P1 alerts: require ≥ 30 knowledge requests in the last 5 minutes
- For P2 cache alerts: require ≥ 50 cache-hit events in the evaluation window

If below threshold:

- downgrade severity
- monitor trend until volume is sufficient

---

## Playbook A — Alert A (P1): End-to-End p99 Latency Regression

**Intent**  
Critical tail-latency degradation for knowledge requests.

### A-0. Confirm the symptom

- Is p99 elevated for ≥ 5 minutes?
- Does p50 remain normal while p99 spikes? (tail-only issue)
- Is this isolated to a single preset/model/environment?

### A-1. Attribute the latency (Retrieval vs LLM vs System)

Use whichever is available:

**Langfuse**

- Compare:
  - Retrieval latency (observation: `retrieval`)
  - LLM latency (observation: `answer:llm`)
  - Trace total duration

**PostHog**

- Use `latency_breakdown`:
  - `latency_retrieval_ms` vs `latency_llm_ms`
- Compare to end-to-end `duration_ms`

### A-2. Fast mitigations (choose the smallest effective lever)

**If Retrieval is the bottleneck**

- Mitigation options (prefer reversible):
  1. Reduce retrieval load (temporarily lower `retrieve_k` / `final_k` if feature-flagged)
  2. Disable expensive optional stages (reranker, multi-query) if supported by flags
  3. Switch to a lighter retrieval path (if you have a fallback)
- Verify improvement within 10–15 minutes

**If LLM is the bottleneck**

- Mitigation options:
  1. Switch to a more reliable provider/model (fallback) for knowledge
  2. Reduce prompt/context size ceilings (token budgets) if safe
  3. Temporarily disable advanced prompt stages (rewrite/summary) if applicable
- Verify improvement (p95 then p99)

**If System/Infra is the bottleneck**

- Look for:
  - cold starts / memory pressure / CPU saturation
  - database connection pool exhaustion
- Mitigation options:
  1. Scale up runtime or increase concurrency limits
  2. Restart unhealthy instances (last resort)

### A-3. Confirm and close

- Confirm p99 returns to baseline zone
- Check that abort rate (Alert B) is not rising
- Document:
  - suspected root cause
  - mitigation taken
  - follow-up items

### A-4. Follow-ups (post-incident)

- Add or adjust SLO baselines
- Tune retrieval stages with controlled experiments (Dashboard B), not during incident

---

## Playbook B — Alert B (P1): Abort Rate Spike (Knowledge Requests)

**Intent**  
Users are abandoning requests (often latency-driven, sometimes client-driven).

### B-0. Confirm correlation with latency

- If Alert A is also firing: treat as confirmed UX incident; prioritize A first.
- If Alert A is not firing:
  - Suspect frontend cancellation logic, timeout, or streaming instability.

### B-1. Identify abort patterns

Look for:

- spikes aligned to deploys
- specific presets/models
- only one client surface (floating widget vs full page)

### B-2. Fast mitigations

- If aborts track tail latency:
  - Apply Playbook A mitigations first
- If aborts do not track latency:
  - Mitigation options:
    1. Increase client timeout thresholds (if configurable)
    2. Reduce streaming chunk frequency / buffering settings (if togglable)
    3. Temporarily disable features that encourage frequent aborts (e.g., aggressive auto-cancel on navigation)

### B-3. Confirm and close

- Abort rate should fall back under 5%
- Verify p95/p99 remain stable
- Record:
  - whether issue was server-side vs client-side
  - impacted surfaces and browsers if known

---

## Playbook C — Alert C (P2): Cache Inefficiency (Hit ≈ Miss Latency)

**Intent**  
Cache exists but provides minimal benefit (performance + cost regression).

**Important**  
Do not page on C alone. Always correlate with Alert A and overall latency trend.

### C-0. Confirm the two parts

1. Cache hit rate drop (C-1) OR
2. Cache hits not faster than misses (C-2)

### C-1. Diagnose cache key stability

Common causes:

- prompt hash instability (minor config drift yields different keys)
- TTL misconfiguration (too short)
- cache applied too late in pipeline

Checks:

- Dashboard A: cache hits vs misses trend
- Compare early vs late cache behavior if available
- Verify `metadata.cache.responseHit` is being emitted consistently

### C-2. Verify “retrieval truly skipped on cache hits”

If cache-hit latency ≈ miss latency:

- retrieval might still be running even when response is cached
- other expensive stages may still run before cache check

Mitigations:

1. Move cache check earlier (design fix; not mid-incident unless safe)
2. Temporarily increase TTL if hit rate is too low (if safe)
3. Roll back recent cache-key changes

### C-3. Confirm and close

- Cache-hit p50 should be materially lower than miss p50
- Cache-hit rate stabilizes near baseline

---

## Cross-Alert Reasoning Cheatsheet

- **A + B together** = confirmed user pain  
  → Mitigate latency first; aborts should follow.

- **A without B (short-lived)**  
  → Monitor; may self-heal. Prepare rollback if sustained.

- **B without A**  
  → Client/streaming behavior or cancellation regression.

- **C alone**  
  → Cost/perf degradation; schedule investigation, do not page.

---

## Incident Notes Template (Copy/Paste)

- Environment:
- Time window:
- Alerts firing:
- Volume gate met? (Y/N):
- Observability healthy? (Y/N):
- Attribution (retrieval vs LLM vs infra):
- Mitigation applied:
- Outcome / metrics after 15m:
- Suspected root cause:
- Follow-ups / owners:

---

## Appendix: Where to Look (Conceptual)

- Langfuse: Trace-level investigation (per-request ground truth)
- PostHog: Aggregate monitoring and alerting (fleet-level trends)
- App logs: Root-cause evidence (errors, timeouts, throttling)

---

End of runbook.
