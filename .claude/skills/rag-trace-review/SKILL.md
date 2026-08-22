---
name: rag-trace-review
description: Use this skill when the user says things like "RAG quality", "citations missing", "insufficient", "retrieval issue", "weak retrieval", "selection pressure", "dedupe pressure", "quota pressure", "token budget clipping", "why did retrieval fail", or "Langfuse trace" and the task is to inspect this repository's retrieval traces and selection traces to determine where support was lost. Use it for contract-level review of retrieval weakness versus downstream selection pressure, dedupe pressure, quota pressure, budget clipping, or trace ambiguity. Do NOT use it for verifying the global telemetry contract, reviewing ingestion write-path correctness, doing broad model-quality review, or running general debugging once the failing retrieval stage is no longer the main question.
---

# When to use

- Use this wrapper to bind the canonical retrieval-trace review skill to this repo.
- Use it when the problem sounds like weak retrieval, missing citations, insufficient support, selection pressure, dedupe pressure, quota pressure, or token-budget clipping.
- Do not use it for telemetry-contract auditing, ingestion verification, broad model-quality review, or general debugging outside the retrieval trace.

# Goals

- Verify whether support was missing from the start or lost during downstream selection.
- Distinguish weak retrieval from dedupe pressure, quota pressure, budget clipping, or trace ambiguity.
- Map the failure to the narrowest local owner layer.
- Stop once the failing retrieval stage is clear enough to hand off or implement the next change.

# Method

## Retrieval Trace Review

### Purpose

Use this method to determine where support disappeared between retrieval and
the final answer context. The goal is to identify the narrowest failing stage.

### Review Steps

1. Identify the trace slice under review using the adapter:
   - retrieval summary
   - selection summary
   - verbose retrieval diagnostics
   - answer-stage support impact
2. Compare the amount and quality of raw support retrieved with the support
   that survived selection and context assembly.
3. Classify the dominant pressure:
   - weak retrieval
   - deduplication pressure
   - quota or diversity pressure
   - token-budget pressure
   - strategy convergence or trace ambiguity
4. Confirm whether the answer failure started upstream at retrieval or
   downstream during selection or context assembly.
5. Stop once the owner layer is clear enough for follow-up work.

### Output Expectations

- State the observations reviewed.
- Name the dominant failing stage.
- Report the dominant pressure.
- Map the issue to the narrowest owner layer.
- End with one concrete next action.

### Boundaries

- Do not use this method for broad telemetry-contract auditing.
- Do not treat a weak answer alone as proof of weak retrieval.
- Do not continue into ingestion or model-quality review once the retrieval
  stage failure is already clear.

# Workflow

1. If the canonical playbook or local adapter has already been referenced in the conversation, reuse that context instead of re-reading.
2. Read the canonical playbook for the generic retrieval-review method and the local adapter for repo-specific trace names, stage map, metrics, and ownership clues.
3. Identify which local trace slice is under review: retrieval summary, selection summary, verbose retrieval diagnostics, or answer-stage support impact.
4. Use the adapter to map the request onto the local observations, stage names, and metrics.
5. Compare raw support, selected support, and final answer support to classify the dominant failure stage.
6. Report the narrowest retrieval failure and stop before drifting into telemetry-contract review, ingestion verification, or general model-quality critique.

# Output format

- Scope reviewed
- Observation(s) reviewed
- Strategy path active
- Failing stage
- Observed evidence
- Dominant pressure
- Primary classification
- Most likely owner layer
- Confidence
- Next single action

Required ending:
- `Primary classification:` weak retrieval | selection pressure | deduplication pressure | quota or diversity pressure | budget pressure | trace ambiguity
- `Owner layer:` retrieval logic | selection logic | context assembly | trace instrumentation
- `Confidence:` high | medium | low
- `Next single action:` one concrete follow-up step only

# Common pitfalls

- Do not restate the full retrieval-review method here; use the canonical playbook.
- Do not inline the repo's trace schema, metric glossary, or strategy matrix here; use the local adapter.
- Do not treat a single bad answer as proof of weak retrieval without checking downstream selection pressure.
- Do not turn this skill into telemetry-contract review, ingestion review, or broad model-quality commentary.
- Do not keep digging once the failing retrieval stage is already clear.

# Local context

Repo-specific vocabulary, vendor surfaces, invariants, and control knobs live in
[`docs/telemetry/retrieval-trace-review-local-adapter.md`](../../../docs/telemetry/retrieval-trace-review-local-adapter.md). Read it before applying the method above.

# Local overrides

- Default observation names in this repo are `rag:root`, `context:selection`, `rag_retrieval_stage`, and `answer:llm`.
- Stop once the failing retrieval stage is localized enough to hand off or implement the next change.
