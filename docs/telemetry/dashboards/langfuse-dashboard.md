---

> ⚠️ Langfuse UI Constraints (Read First)  
>  
> The current Langfuse UI has the following hard limitations:  
> - Metrics are single‑select (no multi‑select p50/p95/p99 in one widget)  
> - Breakdown Dimension cannot reference arbitrary metadata paths  
> - Breakdown supports only built‑in fields (Environment, Tags, Id, Version, etc.)  
> - Boolean metadata (e.g. aborted, cache.responseHit) CANNOT be used directly as breakdowns  
>  
> As a result:  
> - Percentiles require separate widgets  
> - Boolean comparisons require filters or paired widgets  
> - Some concepts are expressed as *comparisons*, not literal breakdowns  

---

> **Derives from canonical:** [Telemetry alerting contract](../alerting-contract.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

All widgets below assume the signal names, semantics, and alert thresholds defined in `alerting-contract.md`; this page only documents their dashboard manifestations.

### Why Dashboard C Comes First

This document intentionally starts with **Dashboard C (Latency, Cost & Observability Integrity)** rather than following alphabetical order.

Dashboard C validates **platform health and telemetry correctness**, which are prerequisites for interpreting any downstream signals.
If latency metrics, abort signals, or observation coverage are wrong or incomplete, conclusions drawn from retrieval quality (Dashboard B) or traffic patterns (Dashboard A) are unreliable.

> **If observability is broken, do not tune retrieval or traffic — fix the platform first.**

For this reason, dashboards are presented in **C → B → A** order to reflect diagnostic priority, not naming sequence.

---

### Dashboard C — Latency, Cost & Observability Integrity (Infra / Platform)

**Purpose**

Dashboard C answers the most fundamental operational question:

> “Is the platform healthy, predictable, and observable enough to trust any other analysis?”

This dashboard is owned by **infra / platform teams** and acts as a **gatekeeper** for all other dashboards.
If Dashboard C shows anomalies, downstream dashboards must not be used for tuning or decision‑making.

Widgets: **C‑1a through C‑6b**

**Purpose**

Dashboard C answers:

> “Is the system fast, predictable, and observable — and are we paying more than expected?”

This dashboard is used by infra / platform owners, not product teams.

---

### C‑1a. End‑to‑End Latency — p50

**Widget Description**  
Median end‑to‑end latency experienced by users for knowledge requests. Represents baseline system responsiveness excluding tail outliers.

---

### C‑1b. End‑to‑End Latency — p95

**Widget Description**  
95th percentile end‑to‑end latency capturing slow but acceptable tail user experiences.

---

### C‑1c. End‑to‑End Latency — p99

**Widget Description**  
99th percentile latency indicating critical user experience risks and tail latency issues.

---

**How to read**

- p50 = baseline user experience
- p95 = slow but acceptable tail
- p99 = critical UX risk
- p99 rising alone → retrieval or LLM bottlenecks
- All three rising → systemic platform regression

---

### C‑2. LLM Generation Latency

**Description**

Median latency of the LLM generation step, isolated from retrieval and orchestration overhead.

**How to read**

- Should remain stable per model/provider
- Sudden jumps indicate provider throttling, model swap, or prompt growth

---

### C‑3. Retrieval Latency

**Description**

Median latency of vector retrieval and ranking operations.

**How to read**

- Gradual increase → index growth
- Sudden spikes → cache cold starts or database contention

---

### C‑4. Abort Rate (Knowledge Requests)

**Description**

Count of knowledge requests that were aborted by the client before completion.

**How to read**

- Abort spikes usually lag latency spikes
- Sustained aborts indicate UX or streaming issues

---

### C‑5a. Cache Hit Latency

---

### C‑5b. Cache Miss Latency

---

**Description (shared)**

Compares response latency for cached versus non‑cached knowledge requests.

**How to read**

- Cache hits must be materially faster
- If not, cache is too late or retrieval still runs

---

### C‑6a. Knowledge Traces Count

---

### C‑6b. LLM Generation Observations Count

---

**Description (shared)**

Ensures that expected telemetry components are being emitted consistently.

**How to read**

- C‑6b should closely track C‑6a
- Divergence indicates telemetry wiring regressions

---

### Reading Dashboard C as a System

- p99 latency (C‑1c) is the earliest signal of user pain
- Abort spikes (C‑4) should correlate with p95/p99
- Cache hit latency (C‑5a) must always undercut cache miss latency (C‑5b)
- Any mismatch between C‑6a and C‑6b invalidates latency analysis

---

### Escalation Rules

Escalate immediately when:

- p99 latency increases >2× without deployment
- Abort rate >5% for sustained periods
- Cache hits are not faster than misses
- Required observations disappear from traces

Dashboard C validates **platform health and observability correctness**.  
If Dashboard C is wrong, do not tune RAG or prompts — fix telemetry, caching, or infra first.

---

### Widget-Level Interpretation (Dashboard C)

### C‑1a / C‑1b / C‑1c. End‑to‑End Latency (p50 / p95 / p99)

- **What it shows**: User‑perceived latency distribution.
- **How to read**:
  - p50 = baseline
  - p95 = slow tail
  - p99 = critical UX risk
- **Act when**:
  - p99 alone rises → retrieval or LLM bottleneck
  - All rise → infra regression

### C‑2. LLM Generation Latency

- **What it shows**: Pure LLM execution time.
- **How to read**: Should be stable per model.
- **Act when**: Jumps → provider throttling or prompt growth.

### C‑3. Retrieval Latency

- **What it shows**: Vector search + ranking cost.
- **How to read**: Correlates with index size.
- **Act when**: Spikes → DB/cache contention.

### C‑4. Abort Rate

- **What it shows**: Client‑aborted requests.
- **How to read**: UX distress indicator.
- **Act when**: Rising → check p95/p99 immediately.

### C‑5a / C‑5b. Cache Hit vs Miss Latency

- **What it shows**: Performance value of caching.
- **How to read**: Hits must be materially faster.
- **Act when**: No gap → cache too late or retrieval still runs.

### C‑6a / C‑6b. Observability Coverage

- **What it shows**: Telemetry completeness.
- **How to read**: Counts should track closely.
- **Act when**: Divergence → telemetry regression; stop tuning.

---

### Dashboard B — Retrieval & Ranking (Product / Data Science)

**Purpose**

Dashboard B evaluates whether **retrieval and ranking are producing relevant, diverse, and cost‑effective context**.

It is used by **product, data science, and search relevance owners** to diagnose quality regressions,
ranking drift, embedding mismatches, and wasted Auto/Multi cost.

Dashboard B assumes that:

- Traffic signals (Dashboard A) are stable
- Telemetry and latency (Dashboard C) are trustworthy

If those assumptions do not hold, conclusions from Dashboard B may be misleading.

Widgets: **B‑1 through B‑7**

### Reading Dashboard B as a System

Dashboard B answers: “Is retrieval doing the right thing, and is it worth the cost?”

Use these rules to read widgets together, not in isolation:

- Retrieval Attempt Rate ≈ Knowledge Requests  
  If attempts drop while knowledge traffic stays flat, routing or guardrails are skipping retrieval.

- Auto Trigger Rate ⊆ Retrieval Attempt Rate  
  Auto can only trigger if retrieval ran. Auto spikes without retrieval indicate telemetry or logic bugs.

- Retrieval Insufficient Rate ↑ + Retrieval Highest Score ↓  
  This combination almost always indicates:
  - Embedding mismatch
  - Index drift
  - Over‑strict similarity thresholds

- Retrieval Highest Score (Average) should be stable over time  
  Gradual decline usually indicates corpus growth without re‑tuning ranking weights.

- Retrieval Highest Score (Trend) sudden drops without Insufficient spikes  
  Often signal:
  - Ranking weight regressions
  - Persona / docType weight changes
  - Re‑ranking disabled unintentionally

- Context Selection Diversity ↓ while Highest Score stays flat  
  Indicates single‑document dominance or quota pressure rather than true relevance loss.

- Auto Trigger Rate ↑ with no score uplift  
  Means Auto/Multi logic is adding cost without quality gain — thresholds should be tightened.

> Dashboard B is NOT a traffic dashboard.
>
> Absolute counts are secondary. Always normalize against Dashboard A (knowledge volume).
> If Dashboard B looks wrong, verify Dashboard A first.

### When to Escalate

Escalate investigation when:

- Insufficient Rate > 10% for sustained periods
- Highest Score drops >20% without deployment
- Auto Trigger Rate changes suddenly without config changes

Always correlate with:

- Recent ingestion runs
- Embedding model changes
- Ranking weight updates

---

### Widget-Level Interpretation (Dashboard B)

### B‑1. Retrieval Attempt Rate

- **What it shows**: Whether retrieval actually runs.
- **How to read**: Should closely track A‑2.
- **Act when**: Drops → guardrails or routing bypassing retrieval.

### B‑2. Auto Trigger Rate

- **What it shows**: How often Auto/Multi logic activates.
- **How to read**: Subset of retrieval attempts.
- **Act when**: High without score uplift → wasted cost.

### B‑3. Retrieval Insufficient Rate

- **What it shows**: Fraction of retrievals judged insufficient.
- **How to read**: Quality failure signal.
- **Act when**: Sustained >10% → inspect embeddings or thresholds.

### B‑4. Retrieval Highest Score (Average)

- **What it shows**: Overall retrieval quality level.
- **How to read**: Should be stable over time.
- **Act when**: Gradual decline → corpus growth or ranking drift.

### B‑5. Retrieval Highest Score (Trend)

- **What it shows**: Short‑term quality changes.
- **How to read**: Sensitive to regressions.
- **Act when**: Sudden drop → recent ranking/config change.

### B‑6. Context Selection Diversity

- **What it shows**: Variety of documents selected.
- **How to read**: Prevents single‑doc dominance.
- **Act when**: Drops → quota pressure or weighting skew.

### B‑7. Auto Trigger Effectiveness

- **What it shows**: Whether Auto improves outcomes.
- **How to read**: Compare against score uplift.
- **Act when**: No uplift → tighten Auto criteria.

---

### Dashboard A — Traffic, Cache & Stability (Usage Guide)

**Purpose**

Dashboard A provides the **traffic and caching baseline** for the entire system.

It answers:

- How much load the system is handling
- How much of that load engages retrieval and LLM generation
- How effectively caching is reducing cost and latency

Dashboard A is primarily descriptive, not diagnostic.
Its metrics serve as **denominators and context** for Dashboards B and C rather than optimization targets by themselves.

### Widget-Level Interpretation (Dashboard A)

### A‑1. Total Request Volume

- **What it shows**: Overall system load.
- **How to read**: Acts as the denominator for all downstream rates.
- **Act when**: Sudden spikes without cache hits → investigate traffic sources or bots.

### A‑2. Knowledge Requests

- **What it shows**: Requests that engage retrieval, Auto, Multi, and caching.
- **How to read**: Direct proxy for retrieval + LLM cost.
- **Act when**: Growth outpaces cache hits → expect rising cost.

### A‑3. Non‑Knowledge Traffic (Chitchat / Command)

- **What it shows**: Baseline LLM usage without retrieval.
- **How to read**: Should stay relatively stable vs A‑2.
- **Act when**: Sudden growth → intent routing regression.

### A‑4. Early Cache Requests

- **What it shows**: Deterministic cache hits before Auto/Multi logic.
- **How to read**: Indicates prompt repeatability.
- **Act when**: Drops → cache key instability or prompt drift.

### A‑5. Late Cache Requests

- **What it shows**: Cache hits after retrieval decisions.
- **How to read**: Expected to be low but stable.
- **Act when**: Sudden spikes → over‑broad cache keys (risk).

### A‑6. Response Cache Hits

- **What it shows**: Successful reuse of cached responses.
- **How to read**: Primary cost‑savings signal.
- **Act when**: Flat zero → cache disabled or TTL mismatch.

### A‑7. Response Cache Miss Count

- **What it shows**: Fresh LLM generations.
- **How to read**: Should scale with A‑2.
- **Act when**: Misses rise faster than A‑2 → prompt variance.

### A‑8. Aborted Requests

- **What it shows**: Client‑aborted knowledge requests.
- **How to read**: UX distress signal.
- **Act when**: Rising → immediately check Dashboard C latency.

---

### Operating Model Across Dashboards

- Dashboard A sets the baseline traffic and caching context.
- Dashboard B diagnoses retrieval and ranking quality.
- Dashboard C monitors latency, aborts, and telemetry health.
- Always correlate across dashboards for root cause analysis.
- Avoid tuning retrieval or prompts until telemetry and infra are validated.

---

### Why There Is No Dashboard D

- Dashboards A, B, and C cover traffic, retrieval, and latency comprehensively.
- Additional dashboards risk fragmentation and confusion.
- Focus on improving signal quality and actionable alerts within these three.

---
