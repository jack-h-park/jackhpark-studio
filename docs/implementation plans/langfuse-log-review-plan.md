# Langfuse Log Review & Hardening Plan

This document defines a **phased, executable plan** to stabilize and improve Langfuse telemetry for the RAG pipeline.
The phases are ordered by **observability correctness first**, then **semantic clarity**, then **selection-quality validation**.

---

## Phase 1 — Span Duration Integrity (FOUNDATIONAL)

### Goal

Ensure every Langfuse span reports a **non-zero, trustworthy duration** so timing data can be trusted.

### Observed Issue

- Multiple spans (`reverse_rag`, `hyde`, `retrieval`, `reranker`, `rag:root`, etc.) show:
  - `startTime === endTime`
  - Duration effectively `0ms`
- This invalidates latency analysis and waterfall reasoning.

### Likely Causes

- `startTime` reused for `endTime`
- Span emitted before async work completes
- Missing `finally` block for span termination
- Mixed time sources (`Date.now()` misuse)

### Required Changes

1. **Enforce try/finally span lifecycle**
   - Every span must be ended in `finally {}`.
2. **Measure time, don’t reuse timestamps**
   - Do not copy `startTime` → `endTime`
3. **Optional (recommended)**
   - Measure duration using `performance.now()` or `hrtime`
   - Serialize to ISO timestamp only at emit time

### Example Pattern (Reference)

```ts
const span = langfuse.startSpan({ name: "retrieval" });
try {
  await runRetrieval();
} finally {
  span.end();
}
```

### Verification Checklist

- [ ] Same request run 3 times → durations are **not identical**
- [ ] No core span shows `0ms`
- [ ] Retrieval / reranker / response-summary show realistic latency
- [ ] Parent span duration ≥ sum of children

### Exit Criteria (Phase 1 Complete)

All spans consistently show non-zero duration across multiple runs.

### Implementation Notes (Phase 1)

- Implemented a `withSpan` helper to wrap async work with try/finally and explicit `startTime`/`endTime`.
- Added dev-only warnings for would-be 0ms spans to catch regressions.

---

## Phase 2 — Provider / Model Attribution Hygiene

### Goal

Remove ambiguity between **LLM execution** and **non-LLM operations**.

### Observed Issue

- Non-LLM spans (e.g. retrieval) show:
  - `provider: openai`
  - `model: gpt-4o-mini`
- Meanwhile, actual generation model is `mistral-ollama`

### Required Changes

- Only **LLM execution spans** may include:
  - `provider`
  - `model`
- Retrieval / DB spans must instead use:
  - `component: "retrieval"`
  - `source: "supabase"` (or equivalent)

### Recommended Field Split

- `generationModel`
- `embeddingModel`
- `retrievalSource`

### Exit Criteria

- Retrieval spans no longer report LLM provider/model
- Generation spans accurately reflect the active model

---

## Phase 3 — Deduplication & Selection Metric Consistency

### Goal

Ensure selection metrics match the **actual document list semantics**.

### Observed Issue

- Identical `doc_id` appears multiple times
- `droppedByDedupe = 0` despite visible duplicates
- `uniqueDocs` unclear vs final output

### Required Decisions

1. Confirm selection unit:
   - Document-level **or**
   - Chunk-level
2. Align field naming accordingly:
   - `doc_id` vs `chunk_id`
3. Normalize metric timing:
   - Deduplication metrics must be computed **after dedupe**

### Recommended Metrics

- `inputCount`
- `uniqueBeforeDedupe`
- `dedupedCount`
- `uniqueAfterDedupe`
- `droppedByDedupe`

### Exit Criteria

- Metrics match visible selection list
- No logical contradictions in counts

---

## Phase 4 — Retrieval Stage Schema Clarity

### Goal

Make each retrieval stage semantically explicit and predictable.

### Recommended Stages

1. `raw_results`
   - `{ doc_id, similarity }`
2. `enriched`
   - `+ doc_type, persona_type, is_public`
3. `after_weighting`
   - `+ weight, finalScore`

### Requirements

- Weighting must never occur on unenriched data
- Each stage logs only fields it is responsible for

### Exit Criteria

- No unexplained `null` fields
- Weighting inputs are fully enriched

---

## Phase 5 — Config Log Deduplication & Size Reduction

### Goal

Improve Langfuse readability and reduce log volume.

### Observed Issue

- `chatConfig` and `ragConfig` duplicated verbatim in spans

### Required Changes

- Keep one canonical config block
- Replace others with:
  - `presetKey`
  - `configHash`
  - `promptBaseVersion`

### Exit Criteria

- Core spans are human-readable without scrolling
- Config duplication removed

---

## Execution Order

1. Phase 1 (Span duration) **MUST complete first**
2. Phase 2–3 next (semantic correctness)
3. Phase 4–5 last (clarity & optimization)

---

## Phase 2 — Field Semantics (Complete)

- **LLM spans** now advertise `provider`, `model`, `generationProvider`, and `generationModel`.
- **Retrieval / orchestration spans** drop LLM fields and instead include `component`, `retrievalSource`, and `cache`.
- **Selection spans** report `component: "selection"` plus quota/MMR details, while `rag:root` uses `component: "rag_root"`.

## Field Semantics

- `provider` / `model` (and `generationProvider` / `generationModel`) appear **only** on spans that execute an LLM request (`reverse_rag`, `hyde`, final generation spans, etc.).
- Non-LLM spans (retrieval, reranker, response-summary, `rag_retrieval_stage`, `rag:root`, `context:selection`) omit LLM attribution and instead use:
  - `component` (`retrieval`, `reranker`, `selection`, `rag_root`, `response`)
  - `retrievalSource` when data is fetched from Supabase
  - `cache` objects with `retrievalHit`
- Embedding-related spans can populate `embeddingProvider` / `embeddingModel` without implying generation work.

## Status

- Phase 1: ✅ Completed (withSpan wrapper + finally lifecycle)
- Phase 2: ✅ Completed (metadata semantics cleanup)
- Phase 3: ⏸ Pending
- Phase 4: ⏸ Pending
- Phase 5: ⏸ Pending
