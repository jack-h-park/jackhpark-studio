
# Langfuse Dashboard Guide (RAG / Auto / Cache Observability)

This document describes the **canonical Langfuse dashboard design** for the current LangChain-based RAG implementation.
It is aligned with the actual telemetry emitted by the codebase and the guarantees documented in `langfuse-guide.md`.

The goal of this dashboard is to answer, with minimal noise:

- Are we paying unnecessary LLM cost?
- Is retrieval quality healthy?
- Are Auto / Multi-query mechanisms actually improving results?
- Where are latency or stability bottlenecks?

---

## Dashboard Structure (Recommended)

Do **not** put all widgets into a single dashboard.

### Dashboard A — Traffic, Cache & Stability (Executive / Ops)
Widgets: **1–4, 13**

Purpose:
- Cost control
- Cache effectiveness
- Abort / stability monitoring

---

### Dashboard B — Retrieval & Quality (RAG Tuning)
Widgets: **5–11**

Purpose:
- RAG quality diagnosis
- Auto / Multi-query effectiveness
- Context selection bias detection

---

### Dashboard C — LLM Performance (Optional / Deep Debug)
Widgets: **12 (+ verbose-only views)**

Purpose:
- Model latency comparison
- Abort during generation
- Provider fallback issues

---

## Widget Configuration Conventions

Unless otherwise stated:

- **View**: Traces
- **Trace Name Filter**: `any of → langchain-chat`
- **Time Aggregation**: count / p50 / p95 / p99 as appropriate
- **Filters**:
  - `metadata.intent = "knowledge"` where RAG is involved
- **Grouping**:
  - Prefer grouping by a single dimension only (strategy, winner, etc.)

---

## Group 1 — Traffic & Cache (Widgets 1–4)

### 1. Request Volume by Intent

**Purpose**
Understand overall traffic mix and how much enters the RAG path.

**Widget Setup**
- View: Traces
- Metric: Count
- Group by: `metadata.intent`

**Interpretation**
- Only `knowledge` requests trigger RAG / auto / multi-query
- This is the baseline denominator for all other metrics

---

### 2. Response Cache Strategy Distribution

**Purpose**
Verify early vs late cache behavior after auto/multi introduction.

**Widget Setup**
- View: Traces
- Metric: Count
- Group by: `metadata.responseCacheStrategy`

**Interpretation**
- Early cache → deterministic path
- Late cache → auto/multi decision-dependent path

---

### 3. Response Cache Hit Rate

**Purpose**
Measure LLM cost reduction.

**Widget Setup**
- View: Traces
- Metric: Count
- Group by: `metadata.cache.responseHit`

**Interpretation**
- `true` = LLM avoided
- Expect lower hit rate initially after late-cache rollout

---

### 4. Abort Rate & Context

**Purpose**
Detect UX, streaming, or timeout issues.

**Widget Setup**
- View: Traces
- Metric: Count
- Group by: `metadata.aborted`

**Interpretation**
- Rising abort rate usually correlates with latency spikes
- Investigate whether abort happens before or during `answer:llm`

---

## Group 2 — Auto / Multi-Query Effectiveness (Widgets 5–9)

### 5. Auto Trigger Rate

**Purpose**
See how often Auto HyDE / Rewrite activates.

**Widget Setup**
- View: Observations
- Observation Name: `rag:root`
- Metric: Count
- Group by: `metadata.autoTriggered`

**Interpretation**
- Too high → predicate too aggressive
- Too low → missed quality improvement opportunities

---

### 6. Auto Winner Distribution

**Purpose**
Check whether Auto actually improves results.

**Widget Setup**
- View: Observations
- Observation Name: `rag:root`
- Metric: Count
- Group by: `metadata.winner`

**Interpretation**
- `winner=auto` should justify added cost
- If mostly `base`, reconsider Auto thresholds

---

### 7. Auto Quality Uplift

**Purpose**
Quantify improvement from Auto.

**Widget Setup**
- View: Traces
- Metric: Average
- Fields:
  - `metadata.auto.highestScoreDelta`
  - or compare insufficient before/after

**Interpretation**
- Higher score & lower insufficient = success
- No change → Auto adds cost without benefit

---

### 8. Multi-Query Execution Rate

**Purpose**
Understand real usage of multi-query.

**Widget Setup**
- View: Observations
- Observation Name: `rag:root`
- Metric: Count
- Group by: `metadata.multiQueryRan`

**Interpretation**
- Rare execution is normal (guarded feature)
- Frequent execution → review suppression rules

---

### 9. Multi-Query Effectiveness

**Purpose**
Validate candidate diversity gains.

**Widget Setup**
- View: Traces
- Metric: Average
- Fields:
  - `metadata.auto.mergedCandidates`
  - `metadata.auto.highestScoreDelta`

**Interpretation**
- No uplift despite merge → query quality or merge logic issue

---

## Group 3 — RAG Internals (Widgets 10–12)

### 10. Retrieval Quality Health

**Purpose**
Primary RAG quality signal.

**Widget Setup**
- View: Observations
- Observation Name: `rag:root`
- Metrics:
  - Average `finalK`
  - Average `candidateK`
  - Scores:
    - View: Scores
    - Score Name: `retrieval_highest_score`
    - Metric: Average / p50 / p95
  - Count `insufficient=true`

**Interpretation**
- Frequent `insufficient=true` = retrieval weakness
- CandidateK >> retrievedCount = threshold/index issue

### Why Scores Are Used

Langfuse cannot average arbitrary observation metadata, so we emit dedicated Score events (primary `retrieval_highest_score` plus optional `retrieval_insufficient` and `context_unique_docs`) to expose chartable quality metrics without storing raw questions or other PII.

---

### 11. Context Selection Bias & Diversity

**Purpose**
Detect document dominance or chunk duplication.

**Widget Setup**
- View: Observations
- Observation Name: `context:selection`
- Metrics:
  - Average `uniqueDocs`
  - Sum `droppedByDedupe`
  - Sum `droppedByQuota`
  - Average `quotaEndUsed`

**Interpretation**
- Low uniqueDocs + high quotaEndUsed → single-doc dominance
- High droppedByDedupe → ingestion or chunking problem

---

### 12. LLM Latency & Stability

**Purpose**
Monitor generation performance.

**Widget Setup**
- View: Observations
- Observation Name: `answer:llm`
- Metrics:
  - Duration p50 / p95 / p99
- Group by:
  - `metadata.model`
  - `metadata.provider`

**Interpretation**
- Latency regression = provider or prompt change
- Abort during generation indicates streaming pressure

---

## Group 4 — Quality Guardrail (Widget 13)

### 13. Insufficient Spike Alert

**Purpose**
Fastest indicator of system degradation.

**Widget Setup**
- View: Observations
- Observation Name: `rag:root`
- Metric: Count
- Filter: `metadata.insufficient = true`

**Interpretation**
- Sudden spike usually indicates:
  - Index corruption
  - Ingestion failure
  - Embedding mismatch

---

## Final Notes

- All widgets above are **aligned with emitted telemetry**
- No widget relies on undocumented fields
- Verbose-only spans (`rag_retrieval_stage`, raw inputs) are intentionally excluded

Once Dashboard A (Traffic & Cache) is stable, proceed to Dashboard B for tuning.
