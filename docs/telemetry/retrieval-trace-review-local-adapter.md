# Retrieval Trace Local Adapter

This document is the repo-specific adapter for the canonical playbook `jackhpark-ai-skills/playbooks/retrieval-trace-review.md` and the canonical skill `jackhpark-ai-skills/skills/dev/rag-trace-review/SKILL.md`.

It intentionally contains only the local trace vocabulary, stage map, metric meanings, strategy terms, implementation ownership clues, and reporting additions needed to apply that method inside `nextjs-react-notion-x`.

## Local Vocabulary

- **Knowledge intent**: the local request class where retrieval traces and selection traces are expected to appear.
- **Base pass**: the default retrieval path before any local auto-correction or forced strategy branch runs.
- **Auto correction**: the local fallback path that may rewrite or synthesize a new retrieval query when the base pass looks weak.
- **Multi-query fusion**: the local merged candidate path where multiple retrieval variants are combined before selection.
- **Selection unit**: the local unit used by dedupe-first selection telemetry; in this repo it is chunk-first before doc-level dedupe metrics are added.
- **Context window**: the local post-retrieval selection result that is handed to generation.
- **Insufficient**: the local retrieval-support flag used when the final context is judged too weak or empty.
- **Quota relaxation**: the local behavior where per-document limits are loosened to try to fill the target context size.
- **MMR-lite**: the local diversity bias that gently penalizes repeat support from the same document.

## Primary Local Docs

- [docs/telemetry/implementation/rag-observations.md](../../docs/telemetry/implementation/rag-observations.md)
- [docs/architecture/rag/rag-retrieval-engine.md](../../docs/architecture/rag/rag-retrieval-engine.md)
- [docs/implementation/plans/langfuse-log-review-plan.md](../../docs/implementation/plans/langfuse-log-review-plan.md)

## Local Trace and Observation Names

- `rag:root`
  - local retrieval-pass summary
- `context:selection`
  - local selection, dedupe, quota, and diversity summary
- `rag_retrieval_stage`
  - local verbose retrieval diagnostics
- `answer:llm`
  - local generation lifecycle observation used to relate final answer behavior back to retrieval support

## Local Retrieval Stage Map

The current local stage map is:

1. base vector retrieval
2. weak-retrieval check
3. optional auto-correction path
4. optional merged candidate path
5. context-window construction
6. chunk dedupe
7. doc dedupe
8. quota- and budget-aware selection
9. final context handoff to generation

The local review flow should treat `rag:root` as the retrieval-pass summary and `context:selection` as the downstream pressure summary.

## Local Metric Glossary

Exact field definitions are in [docs/telemetry/implementation/rag-observations.md](../../docs/telemetry/implementation/rag-observations.md).

Key field names to recognize when reading traces:

- Retrieval summary: `finalK`, `candidateK`, `topKChunks`, `retrievedCount`, `droppedCount`, `highestScore`, `similarityThreshold`, `includedCount`, `insufficient`
- Strategy signals: `autoTriggered`, `winner`, `multiQueryRan`, `decisionSignature`
- Selection metrics: `quotaStart`, `quotaEndUsed`, `droppedByDedupe`, `droppedByQuota`, `mmrLite`, `mmrLambda`, `selectionUnit`, `inputCount`, `uniqueBeforeDedupe`, `uniqueAfterDedupe`, `finalSelectedCount`, `docInputCount`, `docUniqueBeforeDedupe`, `docUniqueAfterDedupe`, `docDroppedByDedupe`

## Local Strategy Vocabulary

- **Auto-RAG**
  - the local self-correcting retrieval policy
- **HyDE**
  - the local synthetic-document retrieval branch
- **rewrite**
  - the local query-rewrite branch
- **reverse RAG**
  - the local forced strategy path controlled by guardrails/presets
- **base**
  - the local default retrieval path label
- **auto**
  - the local auto-corrected retrieval path label
- **decisionSignature**
  - the local decision trace for strategy comparison and selection

## Local Code and Ownership Mapping

- `lib/server/api/langchain_chat_impl_heavy.ts`
  - request-level retrieval orchestration and `rag:root` assembly
- `lib/server/langchain/ragRetrievalChain.ts`
  - retrieval execution flow and `context:selection` emission
- `lib/server/chat-guardrails.ts`
  - context-window construction, dedupe logic, quota loop, and local `insufficient` semantics
- `lib/rag/retrieval.ts`
  - retrieval plumbing
- `lib/rag/ranking.ts`
  - weighting and ranking adjustments
- `db/schema/schema.latest.sql`
  - retrieval RPC definitions and vector search realization

## Local Runtime Artifacts and Config Clues

- local Postgres RPC retrieval functions using pgvector-backed similarity search
- guardrail-controlled retrieval settings that affect target context size, thresholding, budget, and strategy forcing
- telemetry detail level controls that determine whether deeper retrieval observations are emitted
- selection and context assembly behavior tied to local guardrail settings and preset choices

## Repo-Specific Exclusions

- Do not treat the local trace names as shared vocabulary.
- Do not treat local strategy labels as a generic retrieval taxonomy.
- Do not use this adapter for ingestion write-path verification.
- Do not use this adapter for telemetry contract auditing of global event semantics.
- Do not use this adapter for live incident triage beyond localizing retrieval/selection failure within a trace.
- Do not generalize local dedupe, quota, or diversity counters into another repo without a matching schema.
