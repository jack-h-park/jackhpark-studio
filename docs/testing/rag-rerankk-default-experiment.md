# Test Plan: RAG Rerank-K Default Experiment

## Overview

This plan validates a retrieval-quality experiment that introduces a conservative default for reranking:

- When reranking is enabled and `rerank_k` is unset, the system applies:
  - `effective_rerank_k = min(retrieve_k, DEFAULT_RERANK_K)`
- Explicit `rerank_k` values must be preserved.
- The existing K-ordering invariant must hold:
  - Rerank enabled: `retrieve_k ≥ rerank_k ≥ final_k`
  - Rerank disabled: `retrieve_k ≥ final_k`

Goal: improve stability and make reranking cost/latency more predictable without harming quality.

## Scope

### In scope

- Effective K values and ordering
- Candidate counts telemetry correctness
- Cache miss / cache hit behavior
- Basic quality signals (`citationsCount`, `insufficient`)
- PII-safe telemetry invariants

### Out of scope

- Full ranking quality evaluation at scale
- Prompt changes, RAG algorithm changes, cache key changes

---

## Test Configuration

- Ensure reranking is enabled in the preset/config used for these tests.
- DEFAULT_RERANK_K expected value: **20** (confirm in `rag-config.ts`).
- Telemetry:
  - Langfuse tracing enabled (sampling = 1.0 recommended for testing).
  - PII opt-in remains **off** (`LANGFUSE_INCLUDE_PII` not set or false).

---

## Observability Checklist

For each run, capture:

- Response text (high-level sanity only)
- Trace metadata:
  - `metadata.rag.retrieve_k`
  - `metadata.rag.rerank_k` (if enabled)
  - `metadata.rag.final_k`
  - `metadata.rag.candidates_retrieved`
  - `metadata.rag.candidates_reranked` (if enabled)
  - `metadata.rag.candidates_selected`
- Output summary:
  - `citationsCount`
  - `insufficient`
  - `finish_reason`
- Cache fields (if available):
  - `metadata.cache.responseHit`
  - `metadata.cache.retrievalHit`

---

## Test Cases

### TC-01: Rerank enabled + rerank_k unset → default applied

**Purpose**

Verify the default `rerank_k` is applied only when unset and is reflected in telemetry.

**Input message(s)**

1. “Tell me about Jack’s background in enterprise mobility and security. Give a short summary with citations.”

**Preconditions**

- Use a preset where reranking is enabled but `rerank_k` is not explicitly set.
- Ensure cache miss (e.g., new conversation/session).

**Expected**

- `metadata.rag.rerank_k` exists and equals `min(metadata.rag.retrieve_k, 20)`.
- K ordering invariant holds:
  - `retrieve_k ≥ rerank_k ≥ final_k`
- Candidate counts align:
  - `candidates_reranked ≤ rerank_k`
  - `candidates_selected ≤ final_k`
- `finish_reason = success`
- No repeated greeting behavior (sanity check).
- No raw question text in trace/observations unless `LANGFUSE_INCLUDE_PII=true`.

---

### TC-02: Rerank enabled + rerank_k explicitly set → preserved

**Purpose**

Ensure explicit `rerank_k` is not overridden.

**Input message(s)**

1. “Summarize Jack’s RAG/telemetry work in 5 bullets with citations.”

**Preconditions**

- Use a preset/config where rerank is enabled AND `rerank_k` is explicitly set (e.g., 40).
- Cache miss.

**Expected**

- `metadata.rag.rerank_k == <explicit value>`
- K ordering invariant holds.
- Candidate counts align with effective Ks.
- No unexpected quality regression (citationsCount not systematically lower than baseline for similar queries).

---

### TC-03: Rerank disabled → rerank_k absent and ordering holds

**Purpose**

Confirm rerank-k default logic does not leak into rerank-disabled mode.

**Input message(s)**

1. “What is Jack’s AI assistant architecture in one paragraph? (No need for citations.)”

**Preconditions**

- Use a preset with reranking disabled.
- Cache miss.

**Expected**

- `metadata.rag.rerank_k` is absent or null (depending on convention).
- Ordering invariant holds:
  - `retrieve_k ≥ final_k`
- No rerank-specific candidate counts are emitted (or they are null/0 by convention).

---

### TC-04: Cache hit preserves telemetry semantics and does not mis-infer retrieval execution

**Purpose**

Validate cache-hit behavior remains correct and doesn’t break retrieval flags/insufficient semantics.

**Input message(s)**

1. Repeat the exact same message from TC-01 immediately.

**Preconditions**

- Must be a cache hit for response cache (or whichever cache layer is active).

**Expected**

- Cache hit indicators show hit (`metadata.cache.responseHit` true or equivalent).
- `finish_reason` reflects cache hit conventions (if present).
- `metadata.rag.retrieval_attempted` should be false/absent on response cache hits (current-request semantics).
- `insufficient` must not become true solely because `citationsCount == 0` on cache hit unless the guarded inference rule applies.

---

### TC-05: Abort/disconnect path still produces telemetry summaries

**Purpose**

Ensure streaming abort does not regress “missing input/output” warnings.

**Input message(s)**

1. “Write a detailed explanation of Jack’s RAG pipeline stages and how reranking interacts with Top-K.”

**Steps**

- Start the request (streaming).
- Abort the client early (stop request / close connection).

**Expected**

- Trace output summary exists.
- `finish_reason = aborted` (or equivalent).
- No PII leakage by default.

---

## Baseline & Evaluation Notes (Small Experiment)

This is a conservative-default experiment. Expected effects:

- `candidates_reranked` becomes more stable/upper-bounded for presets that previously left `rerank_k` unset.
- Latency variance may reduce.
- Quality should not systematically worsen (watch citationsCount and manual spot checks).

Suggested small sample:

- 10 cache-miss runs and 10 cache-hit runs across a small set of representative questions.
- Compare before/after only if you have a prior baseline; otherwise treat this as “first baseline after instrumentation.”

---

## Pass/Fail Criteria

### Pass

- Effective rerank_k default applies only when unset.
- K ordering invariant holds in all modes.
- Candidate counts are consistent with effective Ks.
- Cache hit semantics remain correct.
- Telemetry summaries exist across all exits and are PII-safe by default.

### Fail (any)

- rerank_k default overrides explicit rerank_k.
- Ordering invariant breaks.
- candidates_reranked exceeds rerank_k.
- Cache hit shows retrieval_attempted=true for the current request.
- Missing input/output warnings reappear in Langfuse.

---

## Rollback Plan

- Disable the default by removing/zeroing DEFAULT_RERANK_K application path (or reverting the commit).
- Keep the K normalization helper + tests (optional) if they are independently useful.
