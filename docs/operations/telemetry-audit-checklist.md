# Operational Telemetry Audit Checklist


This checklist verifies the signal semantics defined in `alerting-contract.md`; it does not redefine them.

## Purpose & When to Use

- Ensure telemetry semantics remain correct during refactors or incident response.
- Validate that trace input/output summaries never regress to missing.
- Confirm default PII safety when environment flags are unchanged.
- Verify cache/retrieval/insufficient signals remain trustworthy.
- Run after changes to RAG, cache, telemetry wiring, or dashboard alerts.
- Run when Langfuse dashboards show unexpected spikes or gaps.

## Telemetry Invariants (Authoritative)

- Trace input and output summaries always exist on all exits (success, cache hit, abort, error).
- Raw user content is never stored unless `LANGFUSE_INCLUDE_PII="true"`.
- `metadata.rag.retrieval_attempted` reflects actual retrieval pipeline entry.
- `insufficient` is only inferred under guarded conditions.
- Cache hit flags are monotonic: once true, never revert to false.
- `finish_reason` is always set to one of: `success`, `error`, `aborted`.

## Canonical Scenario Checklist

| Scenario                                    | Expected telemetry fields                                                                                                                                    | Must NOT appear                 | Red flags / common regressions                                                       | How to verify (Langfuse UI / logs)                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------ |
| Response cache hit                          | `metadata.cache.responseHit=true`, `output.finish_reason=success`, `output.cache_hit=true`, `output.answer_chars>0`, `metadata.rag.retrieval_attempted=false | absent`                         | Raw question, raw model output                                                       | `insufficient=true` with no retrieval attempt, cache flags flip false after true | Langfuse trace metadata and output summary |
| RAG executed with citations                 | `metadata.rag.retrieval_attempted=true`, `metadata.cache.retrievalHit` set, `output.citationsCount>0`, `output.finish_reason=success`                        | Raw question unless PII enabled | Missing retrieval_attempted, citationsCount zero with known citations                | Trace metadata + `rag:root`/`context:selection` observations                     |
| RAG executed with citationsCount==0         | `metadata.rag.retrieval_attempted=true`, `output.citationsCount=0`, `output.insufficient=true` (if retrieval used)                                           | Raw question unless PII enabled | `insufficient` missing when retrieval attempted, or true without retrieval attempted | Trace output summary + `rag:root` observation                                    |
| Non-retrieval answer (knowledge but no RAG) | `metadata.rag.retrieval_attempted` absent/false, `output.citationsCount=0`, `output.insufficient` null                                                       | Any retrieval observations      | `insufficient=true` with no retrieval attempt                                        | Trace output summary, no retrieval observations                                  |
| Streaming abort / client disconnect         | `output.finish_reason=aborted`, `output.answer_chars>=0`, `metadata.aborted=true`                                                                            | Raw output text                 | Missing output summary, `finish_reason=success`                                      | Trace output summary + server logs for abort                                     |
| Error path (LLM failure/timeout)            | `output.finish_reason=error`, `output.error_category` set, `metadata.aborted=false`                                                                          | Raw error text or stack         | Missing output summary, `finish_reason=success`                                      | Trace output summary + error logs                                                |

## “Insufficient” Inference Rules (Authoritative)

- `insufficient=true` is allowed only when retrieval was attempted/used and `citationsCount==0`.
- `insufficient` must be null/absent when retrieval was not attempted, even if `citationsCount==0`.
- Cache hit + zero citations alone is not sufficient evidence without retrieval flags.
- Historical origin (e.g., cached response provenance) must not be inferred as retrieval usage for the current request.

## PII Safety Checklist

- Default: no raw question text in trace input, metadata, or observations.
- Only `LANGFUSE_INCLUDE_PII="true"` permits raw question in observations.
- Trace summaries remain numeric/enum fields only.
- Verbose telemetry must not re-enable PII by itself.
- Common foot-guns: debug helpers or custom spans that log raw queries/outputs.

## Retrieval Quality Track Verification

- Cache miss and cache hit paths both succeed without errors.
- Citations render correctly when present.
- Trace metadata includes effective values: `retrieve_k`, `rerank_k` (if enabled), `final_k`, and candidate counts.
- K ordering invariant holds: `retrieve_k ≥ rerank_k ≥ final_k` (rerank enabled) or `retrieve_k ≥ final_k` (disabled).

## Common Failure Patterns & Diagnosis

| Symptom in dashboard                                 | Likely cause                                                                 | Where to look in code first                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| `insufficient` spikes on cache hits                  | Retrieval guard missing or retrieval_attempted incorrectly set on cache hits | `lib/server/api/langchain_chat_impl_heavy.ts` |
| `retrieval_attempted=true` on non-retrieval requests | Retrieval flag set outside pipeline                                          | `lib/server/langchain/ragRetrievalChain.ts`   |
| Missing output summary                               | Finalize step not reached or overwritten                                     | `lib/server/api/langchain_chat_impl_heavy.ts` |
| Cache flags flipping                                 | Monotonic merge rule bypassed                                                | `lib/server/api/langchain_chat_impl_heavy.ts` |

## How This Checklist Evolves

- This file is the canonical operational checklist for telemetry semantics.
- Do not create versioned copies unless semantics fundamentally change.
- If semantics change, update this checklist and link it from `docs/telemetry/langfuse-guide.md`.
