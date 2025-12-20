# Langfuse Guide: Payloads & Dashboards

This guide describes the telemetry data structure (payloads) sent to Langfuse and provides suggestions for building diagnostic dashboards.

> For the overall architecture, telemetry controls (sampling/detail levels), and environment variables, see [Logging & Telemetry Architecture](./telemetry-logging.md).

## Langfuse Tags

Every trace is automatically tagged with the following to allow easy segmentation:

- `env:prod` / `env:dev`: Derived from the runtime environment.
- `preset:<presetKey>`: The chat preset identifier.
- `guardrail:<route>`: The detected guardrail route (`normal`, `chitchat`, or `command`).

Dashboards should use these tags for high-level filtering (e.g., comparing performance between production and development).

## Chat Configuration Snapshot

When telemetry `detailLevel` is `"standard"` or `"verbose"`, a normalized snapshot of the chat configuration is attached to the trace metadata under `metadata.chatConfig`.

### Snapshot Schema

Type: `ChatConfigSnapshot` (see `lib/rag/types.ts`).

- **Top-level**: `presetKey`, `chatEngine`, `llmModel`, `embeddingModel`
- **`rag` group (Retrieval)**:
  - `enabled`, `topK`, `similarity`, `ranker`, `reverseRAG`, `hyde`, `summaryLevel`
  - `numericLimits`: `ragTopK`, `similarityThreshold`
  - `ranking`: `docTypeWeights`, `personaTypeWeights`
- **`context` group (History & Token Budget)**:
  - `tokenBudget`, `historyBudget`, `clipTokens`
- **`telemetry` group**: `sampleRate`, `detailLevel`
- **`cache` group**: `responseTtlSeconds`, `retrievalTtlSeconds`, `responseEnabled`, `retrievalEnabled`
- **Metadata**: `prompt.baseVersion`, `guardrails.route`

> [!NOTE]
> `metadata.ragConfig` is also available as a compatibility alias for older dashboards.

## Caching Telemetry

Cache effectiveness is tracked in `metadata.cache` (on the trace) and within individual retrieval spans:

- `metadata.cache.responseHit`: `true` | `false` | `null` (null if disabled)
- `metadata.cache.retrievalHit`: `true` | `false` | `null`

## Retrieval Telemetry (Verbose Mode)

When `detailLevel` is `"verbose"`, detailed retrieval-stage spans are emitted.

- **Observation Name**: `rag_retrieval_stage`
- **Metadata Fields**:
  - `stage`: e.g., `raw_results`, `after_weighting`, `after_ranking`
  - `engine`: `native` or `langchain`
  - `entries`: An array of up to **8** sanitized document metadata entries.
    - Fields: `doc_id`, `similarity`, `weight`, `finalScore`, `doc_type`, `persona_type`, `is_public`

> [!IMPORTANT]
> To protect PII and keep trace sizes small, actual chunk text or URLs are **never** included in Langfuse retrieval spans.

## Suggested Langfuse Dashboards

You can build powerful insights by filtering and grouping by `metadata.chatConfig.*` and retrieval span metadata:

1. **RAG Config Usage Overview**
   - Group by `chatConfig.presetKey`, `chatConfig.rag.chatEngine`, `chatConfig.rag.ranker`
   - Metrics: count, error rate, average latency.

2. **Doc Type & Persona Impact**
   - Use retrieval entries to see how often each `doc_type` or `persona_type` appears in top-K.
   - Correlate with `chatConfig.rag.ranking.docTypeWeights` to tune your ranking logic.

3. **Cache Effectiveness**
   - Monitor `metadata.cache.responseHit` and `metadata.cache.retrievalHit` ratios.
   - Segment by `presetKey` to see which configurations benefit most from caching.

4. **Latency Breakdown**
   - Plot latencies for different stages (`raw_results` vs `ranking`).
   - Segment by `chatEngine` and `ranker` to identify bottlenecks.

5. **Guardrail Routing**
   - Segment by `guardrail:<route>` tag to see the distribution of queries (normal vs. chit-chat).
