# RAG Telemetry + Langfuse Dashboard Notes

This repo now emits a normalized RAG configuration snapshot and retrieval telemetry into Langfuse for every chat request.

## RAG Config Snapshot

Type: `RagConfigSnapshot` (see `lib/rag/types.ts` and builder in `lib/rag/telemetry.ts`).

Included fields:

- `presetKey`: which preset was active (e.g., `default`, `fast`, `highRecall`)
- `chatEngine`, `llmModel`, `embeddingModel`
- `ragEnabled`, `ragTopK`, `ragSimilarity`
- `ranker`, `reverseRAG`, `hyde`, `summaryLevel`
- Context budgets: `contextTokenBudget`, `historyBudget`, `clipTokens`
- `numericLimits`: snapshots of `ragTopK` and `similarityThreshold` limits
- `ragRanking`: `docTypeWeights` and `personaTypeWeights` (defaults: `DOC_TYPE_WEIGHTS`, `PERSONA_WEIGHTS`)

The snapshot is attached to the top-level Langfuse trace metadata for each chat request under `metadata.ragConfig`.

## Retrieval Telemetry

Retrieval spans/observations include:

- Stage name: `raw_results`, `after_weighting`, etc.
- Engine: `native` or `langchain`
- `presetKey`
- `ragConfig` (optional copy for convenience)
- Per-chunk entries: `doc_id`, `similarity` (base), `weight`, `finalScore`, `doc_type`, `persona_type`, `is_public`

`RAG_DEBUG=true` also mirrors these entries to server logs.

## Suggested Langfuse Views/Dashboards

You can build dashboards by filtering on `metadata.ragConfig.*` and retrieval span metadata:

1) **RAG Config Usage Overview**
   - Group/stack by `ragConfig.presetKey`, `ragConfig.chatEngine`, `ragConfig.ranker`
   - Metrics: count, error rate, average latency

2) **Doc Type Weight vs Usage**
   - Group retrieval entries by `doc_type` and overlay `ragConfig.ragRanking.docTypeWeights`
   - Show how often each `doc_type` appears in top-K and its average `weight` / `finalScore`

3) **Persona Type Impact**
   - Similar to above, grouped by `persona_type` with `ragConfig.ragRanking.personaTypeWeights`

4) **Visibility Filter Effect**
   - Track counts of candidates filtered out where `is_public === false`
   - Show ratio filtered vs total per request; aggregate by `engine`, `presetKey`

5) **Similarity vs Weighted Score Scatter**
   - X-axis: base `similarity`; Y-axis: `finalScore`
   - Color/shape: `doc_type`
   - Helps visualize how weights re-order results

6) **Latency Breakdown by Engine & Ranker**
   - Plot similarity search, metadata hydration, weighting, and ranker latencies
   - Segment by `ragConfig.chatEngine`, `ragConfig.ranker`, `ragConfig.presetKey`

If you export Langfuse dashboards, place JSON under `docs/` (not provided here). Use `metadata.ragConfig.*` and retrieval span metadata to construct filters and groupings.
