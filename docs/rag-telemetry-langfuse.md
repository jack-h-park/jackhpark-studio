# RAG Telemetry + Langfuse Dashboard Notes

> The logging & telemetry architecture (telemetry merge rules, env knobs, etc.) is
> covered in [docs/telemetry-logging.md](./telemetry-logging.md).

This repo now emits a normalized chat configuration snapshot and retrieval telemetry into Langfuse for every chat request.

## Chat Config Snapshot

Type: `ChatConfigSnapshot` (deprecated alias: `RagConfigSnapshot`) – see `lib/rag/types.ts` and builder in `lib/rag/telemetry.ts`.

Included fields:

- Top-level: `presetKey`, `chatEngine`, `llmModel`, `embeddingModel`
- `rag.*` group: `rag.enabled`, `rag.topK`, `rag.similarity`, `rag.ranker`, `rag.reverseRAG`, `rag.hyde`, `rag.summaryLevel`, `rag.numericLimits.ragTopK`, `rag.numericLimits.similarityThreshold`, `rag.ranking.docTypeWeights`, `rag.ranking.personaTypeWeights`
- `context.*` group: `context.tokenBudget`, `context.historyBudget`, `context.clipTokens`
- `telemetry.*` group: `telemetry.sampleRate`, `telemetry.detailLevel`
- `cache.*` group: `cache.responseTtlSeconds`, `cache.retrievalTtlSeconds`, `cache.responseEnabled`, `cache.retrievalEnabled`
- `prompt.baseVersion`
- `guardrails.route`

When telemetry `detailLevel` is not `"minimal"`, the snapshot is attached to the top-level Langfuse trace metadata under `metadata.chatConfig` (with `metadata.ragConfig` available as a compatibility alias).

## Telemetry controls

- `telemetry.sampleRate` controls whether a Langfuse trace is emitted at all.
  - `0` = never, `1` = always, values in between sample via `Math.random()`.
- `telemetry.detailLevel` controls what is attached:
  - `minimal`: trace only (no config snapshot, no retrieval spans)
  - `standard`: includes config snapshot on the trace
  - `verbose`: includes config snapshot + retrieval-stage spans/observations
- Suggested filters:
  - Compare prompt versions by filtering on `chatConfig.prompt.baseVersion`.
  - Segment by guardrail route using `chatConfig.guardrails.route` to see normal vs chit-chat vs command fallbacks.

## Caching + cache telemetry

- Admin cache settings:
  - `cache.responseTtlSeconds` → response cache TTL (0 disables)
  - `cache.retrievalTtlSeconds` → retrieval cache TTL (0 disables)
- Langfuse metadata (when `detailLevel !== "minimal"`):
  - `metadata.cache.responseHit`: `true`/`false`/`null` (null when disabled)
  - `metadata.cache.retrievalHit`: `true`/`false`/`null`
- Retrieval spans (verbose mode) also include `cache.retrievalHit` so you can segment verbose traces by cache effectiveness.

## Retrieval Telemetry

Retrieval spans/observations include:

- Stage name: `raw_results`, `after_weighting`, etc.
- Engine: `native` or `langchain`
- `presetKey`
- `chatConfig` (optional copy for convenience)
- Per-chunk entries: `doc_id`, `similarity` (base), `weight`, `finalScore`, `doc_type`, `persona_type`, `is_public`

`RAG_DEBUG=true` also mirrors these entries to server logs.

## Suggested Langfuse Views/Dashboards

You can build dashboards by filtering on `metadata.chatConfig.*` (with `metadata.ragConfig` still available as an alias for older dashboards if relevant) and retrieval span metadata:

1. **RAG Config Usage Overview**
   - Group/stack by `chatConfig.presetKey`, `chatConfig.rag.chatEngine`, `chatConfig.rag.ranker`
   - Metrics: count, error rate, average latency

2. **Doc Type Weight vs Usage**
   - Group retrieval entries by `doc_type` and overlay `chatConfig.rag.ranking.docTypeWeights`
   - Show how often each `doc_type` appears in top-K and its average `weight` / `finalScore`

3. **Persona Type Impact**
   - Similar to above, grouped by `persona_type` with `chatConfig.rag.ranking.personaTypeWeights`

4. **Visibility Filter Effect**
   - Track counts of candidates filtered out where `is_public === false`
   - Show ratio filtered vs total per request; aggregate by `engine`, `presetKey`

5. **Similarity vs Weighted Score Scatter**
   - X-axis: base `similarity`; Y-axis: `finalScore`
   - Color/shape: `doc_type`
   - Helps visualize how weights re-order results

6. **Latency Breakdown by Engine & Ranker**
   - Plot similarity search, metadata hydration, weighting, and ranker latencies
   - Segment by `chatConfig.rag.chatEngine`, `chatConfig.rag.ranker`, `chatConfig.presetKey`

If you export Langfuse dashboards, place JSON under `docs/` (not provided here). Use `metadata.chatConfig.*` and retrieval span metadata to construct filters and groupings.
