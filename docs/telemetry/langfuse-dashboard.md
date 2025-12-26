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

### Dashboard C — Latency, Cost & Observability Integrity (Infra / Platform)

Widgets: **C‑1a through C‑6b**

**Purpose**

Dashboard C answers:

> “Is the system fast, predictable, and observable — and are we paying more than expected?”

This dashboard is used by infra / platform owners, not product teams.

---

### C‑1a. End‑to‑End Latency — p50

**Widget Configuration (Langfuse UI)**

- View: Traces
- Metric: Latency
- Aggregation: P50
- Filters:
  - metadata.intent = `knowledge`
- Breakdown Dimension: None
- Chart Type: Line Chart

**Widget Description**  
Median end‑to‑end latency experienced by users for knowledge requests. Represents baseline system responsiveness excluding tail outliers.

---

### C‑1b. End‑to‑End Latency — p95

**Widget Configuration (Langfuse UI)**

- View: Traces
- Metric: Latency
- Aggregation: P95
- Filters:
  - metadata.intent = `knowledge`
- Breakdown Dimension: None
- Chart Type: Line Chart

**Widget Description**  
95th percentile end‑to‑end latency capturing slow but acceptable tail user experiences.

---

### C‑1c. End‑to‑End Latency — p99

**Widget Configuration (Langfuse UI)**

- View: Traces
- Metric: Latency
- Aggregation: P99
- Filters:
  - metadata.intent = `knowledge`
- Breakdown Dimension: None
- Chart Type: Line Chart

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

**Widget Configuration**

- View: Observations
- Observation Name: `answer:llm`
- Metric: Latency
- Aggregation: P50
- Breakdown Dimension: None
- Chart Type: Line Chart

**Description**

Median latency of the LLM generation step, isolated from retrieval and orchestration overhead.

**How to read**

- Should remain stable per model/provider
- Sudden jumps indicate provider throttling, model swap, or prompt growth

---

### C‑3. Retrieval Latency

**Widget Configuration**

- View: Observations
- Observation Name: `retrieval`
- Metric: Latency
- Aggregation: P50
- Breakdown Dimension: None
- Chart Type: Line Chart

**Description**

Median latency of vector retrieval and ranking operations.

**How to read**

- Gradual increase → index growth
- Sudden spikes → cache cold starts or database contention

---

### C‑4. Abort Rate (Knowledge Requests)

**Widget Configuration**

- View: Traces
- Metric: Count
- Filters:
  - metadata.intent = `knowledge`
  - metadata.aborted = `true`
- Breakdown Dimension: None
- Chart Type: Line Chart

**Description**

Count of knowledge requests that were aborted by the client before completion.

**How to read**

- Abort spikes usually lag latency spikes
- Sustained aborts indicate UX or streaming issues

---

### C‑5a. Cache Hit Latency

**Widget Configuration**

- View: Traces
- Metric: Latency
- Aggregation: P50
- Filters:
  - metadata.intent = `knowledge`
  - metadata.cache.responseHit = `true`
- Breakdown Dimension: None
- Chart Type: Line Chart

---

### C‑5b. Cache Miss Latency

**Widget Configuration**

- View: Traces
- Metric: Latency
- Aggregation: P50
- Filters:
  - metadata.intent = `knowledge`
  - metadata.cache.responseHit = `false`
- Breakdown Dimension: None
- Chart Type: Line Chart

---

**Description (shared)**

Compares response latency for cached versus non‑cached knowledge requests.

**How to read**

- Cache hits must be materially faster
- If not, cache is too late or retrieval still runs

---

### C‑6a. Knowledge Traces Count

**Widget Configuration**

- View: Traces
- Metric: Count
- Filters:
  - metadata.intent = `knowledge`
- Breakdown Dimension: None
- Chart Type: Line Chart

---

### C‑6b. LLM Generation Observations Count

**Widget Configuration**

- View: Observations
- Observation Name: `answer:llm`
- Metric: Count
- Breakdown Dimension: None
- Chart Type: Line Chart

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

### Dashboard B — Retrieval & Ranking (Product / Data Science)

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
