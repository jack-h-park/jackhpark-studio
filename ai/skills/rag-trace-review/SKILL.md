---
name: rag-trace-review
description: Use this skill when the user says things like "RAG quality", "citations missing", "insufficient", "retrieval issue", "weak retrieval", "selection pressure", "dedupe pressure", "quota pressure", "token budget clipping", "why did retrieval fail", or "Langfuse trace" and the task is to inspect this repository's retrieval traces and selection traces to determine where support was lost. Use it for contract-level review of retrieval weakness versus downstream selection pressure, dedupe pressure, quota pressure, budget clipping, or trace ambiguity. Do NOT use it for verifying the global telemetry contract, reviewing ingestion write-path correctness, doing broad model-quality review, or running general debugging once the failing retrieval stage is no longer the main question.
---

# When to use
- Use this skill to review retrieval traces when the question is where support disappeared between retrieval and the final answer context.
- Use it when the problem sounds like weak retrieval, missing citations, insufficient support, selection pressure, dedupe pressure, quota pressure, or token-budget clipping.
- Do not use it for telemetry-contract auditing, ingestion verification, broad model-quality review, or general debugging outside the retrieval trace.

# Goals
- Verify whether support was missing from the start or lost during downstream selection.
- Distinguish weak retrieval from dedupe pressure, quota pressure, budget clipping, or trace ambiguity.
- Map the failure to the narrowest local owner layer.
- Stop once the failing retrieval stage is clear enough to hand off or implement the next change.

# Inputs to inspect
- Shared method: `shared-docs/skills/retrieval-trace-review.md`
- Local adapter: `docs/telemetry/retrieval-trace-review-local-adapter.md`
- Local trace and retrieval docs named by the adapter
- Relevant local traces, observation summaries, and implementation ownership paths named by the adapter

# Workflow
1. If the shared doc or local adapter has already been referenced in the conversation, reuse that context instead of re-reading. Otherwise read `shared-docs/skills/retrieval-trace-review.md` for the generic retrieval-review method and `docs/telemetry/retrieval-trace-review-local-adapter.md` for this repo's trace names, stage map, metric glossary, strategy vocabulary, heuristics, and ownership clues.
2. Identify which local trace slice is under review: retrieval summary, selection summary, verbose retrieval diagnostics, or answer-stage support impact.
3. Use the adapter to map the request onto this repo's local observations, stage names, and schema-specific metrics.
4. Compare raw support, selected support, and final answer support to classify the dominant failure stage.
5. Report the narrowest retrieval failure and stop before drifting into telemetry-contract review, ingestion verification, or general model-quality critique.

# Output format
- Scope reviewed
- Which local observation(s) were reviewed: `rag:root` | `context:selection` | `rag_retrieval_stage` | `answer:llm`
- Which local strategy path was active: base | auto | merged path | forced strategy path
- Failing stage
- Observed evidence
- Which local pressure dominated: weak retrieval | dedupe | quota | token budget | strategy convergence
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
- Do not restate the full generic retrieval-review method here; use the shared doc.
- Do not inline the repo's trace schema, metric glossary, or strategy matrix here; use the adapter.
- Do not treat a single bad answer as proof of weak retrieval without checking downstream selection pressure.
- Do not turn this skill into telemetry-contract review, ingestion review, or broad model-quality commentary.
- Do not keep digging once the failing retrieval stage is already clear.

# References
- Shared reusable method: `shared-docs/skills/retrieval-trace-review.md`
- Local adapter: `docs/telemetry/retrieval-trace-review-local-adapter.md`
