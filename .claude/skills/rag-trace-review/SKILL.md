---
name: rag-trace-review
description: Use this skill when the user says things like "RAG quality", "citations missing", "insufficient", "retrieval issue", "weak retrieval", "selection pressure", "dedupe pressure", "quota pressure", "token budget clipping", "why did retrieval fail", or "Langfuse trace" and the task is to inspect this repository's retrieval traces and selection traces to determine where support was lost. Use it for contract-level review of retrieval weakness versus downstream selection pressure, dedupe pressure, quota pressure, budget clipping, or trace ambiguity. Do NOT use it for verifying the global telemetry contract, reviewing ingestion write-path correctness, doing broad model-quality review, or running general debugging once the failing retrieval stage is no longer the main question.
---

# When to use
- Use this wrapper to bind the canonical retrieval-trace review skill to this repo.
- Use it when the problem sounds like weak retrieval, missing citations, insufficient support, selection pressure, dedupe pressure, quota pressure, or token-budget clipping.
- Do not use it for telemetry-contract auditing, ingestion verification, broad model-quality review, or general debugging outside the retrieval trace.

# Canonical bindings
- Canonical skill: `jackhpark-ai-skills/skills/dev/rag-trace-review/SKILL.md`
- Local adapter: `docs/telemetry/retrieval-trace-review-local-adapter.md`

# Workflow
1. Read the canonical skill.
2. Read the local adapter.
3. Apply the canonical workflow using this repo's trace names, stage map, and metric glossary.
4. Keep the canonical output contract unless a local override below says otherwise.

# Local overrides
- Default observation names in this repo are `rag:root`, `context:selection`, `rag_retrieval_stage`, and `answer:llm`.
- Stop once the failing retrieval stage is localized enough to hand off or implement the next change.
