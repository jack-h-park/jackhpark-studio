# Telemetry Operational Verification Local Supplement

This document holds both the reusable operational-verification flow and the exact local
signals it applies to in `jackhpark-studio`. The method is in **Verification method**
below; everything after it is repo-specific field names, observation names, and first-pass
ownership hints.

## Exact Local Signals

- Response cache hit:
  - `metadata.cache.responseHit`
  - `output.cache_hit`
- Retrieval cache hit:
  - `metadata.cache.retrievalHit`
- Retrieval attempted:
  - `metadata.rag.retrieval_attempted`
- Finish reason:
  - `output.finish_reason`
- Insufficient:
  - `output.insufficient`
- Citation count:
  - `output.citationsCount`

## Exact Local Observations

- `answer:llm`
- `rag:root`
- `context:selection`
- `rag_retrieval_stage`

## Repo-Specific Verification Notes

- Langfuse is the first local surface for per-request verification.
- PostHog is the first local surface for aggregate event semantics and alert realization.
- The main knowledge-traffic proxy in PostHog is `rag_enabled=true`.
- Default PII-safe behavior means raw question text must not appear unless `LANGFUSE_INCLUDE_PII="true"`.

## First-Pass Ownership Hints

| Symptom | First place to inspect |
| --- | --- |
| `insufficient` spikes on cache hits | `lib/server/api/langchain_chat_impl_heavy.ts` |
| `retrieval_attempted=true` on non-retrieval requests | `lib/server/langchain/rag-retrieval-chain.ts` |
| Missing output summary | `lib/server/api/langchain_chat_impl_heavy.ts` |
| Cache flags flipping | `lib/server/api/langchain_chat_impl_heavy.ts` |

## Related Local Docs

- [docs/telemetry/langfuse-guide.md](../langfuse-guide.md)
- [docs/telemetry/implementation/telemetry-logging.md](../implementation/telemetry-logging.md)
- [docs/telemetry/posthog-ops.md](../posthog-ops.md)

---

# Verification method

## Telemetry Operational Verification

### Purpose

Use this playbook to verify that telemetry still behaves correctly across the
main runtime scenarios after refactors, incident response, or instrumentation
changes. This is an operational verification checklist, not a semantic contract
definition.

### When to use

- After changes to retrieval, caching, telemetry wiring, or alert realization
- When dashboards or traces show unexpected spikes, gaps, or contradictory data
- When incident response needs a fast verification pass before deeper debugging

### Verification Scenarios

Check the following scenario classes using the local adapter for exact field
names, vendor surfaces, and observation names:

| Scenario | Expected evidence | Must not happen | Common regressions |
| --- | --- | --- | --- |
| Response cache hit | Cache hit is explicit, finish outcome is successful, response summary exists, retrieval is not falsely reported for the current request | Raw user content appears when default privacy settings are unchanged | Retrieval flags leak onto cache hits; cache truth flips after initially being set |
| Retrieval answer with support | Retrieval is explicit, support or citation evidence is present, finish outcome is successful | Privacy-safe traces are replaced by raw prompts or outputs | Retrieval was used but support summaries are missing |
| Retrieval answer with no support | Retrieval is explicit, support is empty, insufficient or equivalent flag is justified | Non-retrieval requests are mislabeled as insufficient | Insufficient is missing when retrieval produced no usable support |
| Non-retrieval answer | No retrieval evidence is emitted for the current request, finish outcome is still coherent | Retrieval-only observations appear on non-retrieval flows | Retrieval attempted is set outside the actual retrieval path |
| Abort or disconnect | Abort outcome is explicit and final summaries still exist | Missing output summary or success classification on abort | Finalization does not run on disconnect |
| Error path | Error outcome is explicit and summarized without unsafe payload leakage | Raw stack traces or raw model output leak into telemetry | Finalize step is skipped on error |

### Insufficient Inference Rules

- Insufficient should only be asserted when retrieval actually ran and support
  is still absent or unusable.
- Insufficient should be absent or null when retrieval did not run.
- Historical provenance alone must not be used to infer current-request
  retrieval usage.

### Privacy Verification

- Default behavior should remain privacy-safe.
- Raw user content should not appear unless the local adapter says an explicit
  privacy override is enabled.
- Higher detail levels must not silently re-enable raw payload capture.

### Common Failure Patterns

- Retrieval or cache truth is set outside the owning stage.
- Final summaries are skipped on abort or error exits.
- Privacy-safe summaries are replaced by raw payloads during debugging.
- Outcome classification says success while surrounding evidence says abort or
  error.

### Output Expectations

- Name the scenario classes checked.
- State whether each scenario passed, failed, or was unverifiable.
- Identify the narrowest failing telemetry behavior.
- Point to the likely owner layer using the local adapter.
- End with one concrete next action.
