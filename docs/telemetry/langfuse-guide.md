# Langfuse Guide: Payloads & Dashboards

This guide describes the telemetry data structure (payloads) sent to Langfuse and provides suggestions for building diagnostic dashboards.

> For the overall architecture, telemetry controls (sampling/detail levels), and environment variables, see [Logging & Telemetry Architecture](./telemetry-logging.md).
> For operational verification, use the [Operational Telemetry Audit Checklist](./telemetry-audit-checklist.md).

## Trace Metadata (Request-Level)

Traces emit request-level metadata for filtering. No default tags are attached today; use the trace metadata fields below instead:

- `requestId` (server-generated request identifier, not user text)
- `intent`
- `presetId`
- `responseCacheStrategy`
- `responseCacheHit`
- `aborted`
- `provider`
- `model`
- `environment`
- `questionHash`
- `questionLength`
- `metadata.cache.responseHit`
- `metadata.cache.retrievalHit`
- `metadata.rag.retrieval_attempted` (true when retrieval pipeline runs)
- `chatConfig` (and `ragConfig` alias when a config snapshot is emitted)

Raw question text is excluded by default. It is only included when `LANGFUSE_INCLUDE_PII="true"`.

## Trace Input/Output (PII-Safe Summaries)

To avoid Langfuse "missing input/output" warnings without storing raw prompts or responses:

- **Trace input** includes `intent`, `model`, `topK`, `history_window`, `question_length`, `settings_hash` (no raw question text).
- **Trace output** includes `answer_chars`, `citationsCount`, `cache_hit`, `insufficient`, `finish_reason`, `error_category`.
  - On cache hits, `insufficient=true` is inferred only when retrieval was attempted/used and `citationsCount` is 0.

Model response text is never stored on the trace.

Additionally, the `answer:llm` observation spans the full generation lifecycle, including streaming. It always has a non-zero duration and closes correctly on success, abort, or error with appropriate `finishReason` and `aborted` fields to represent the completion semantics accurately.

## Prompt Versioning

The `prompt.baseVersion` found in the metadata is a unique 12-character SHA256 hash generated from the combination of:

1. `baseSystemPrompt`
2. `baseSystemPromptSummary`
3. `additionalSystemPrompt` (from the specific preset)

This ensures that any change to the prompt text—even a single character—results in a new version string, allowing for precise A/B testing and regression tracking in Langfuse.

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

`responseCacheHit` and `responseCacheStrategy` are also emitted as top-level trace metadata for backwards compatibility.

## Trace vs Observation Telemetry

- **Trace** = request-level quality/cost/latency/decisions and cache outcomes.
- **Observations**:
  - `rag:root` → retrieval quality summary (knowledge intent only)
  - `context:selection` → dedupe/quota/MMR selection stats (knowledge intent only)
  - `answer:llm` → generation execution with streaming-safe timing and proper abort/error semantics
  - `rag_retrieval_stage` → verbose retrieval diagnostics

## Emission Matrix by Intent and Detail Level

The table below summarizes which observations are emitted based on **chat intent** and **telemetry detailLevel**. This matrix defines the expected telemetry contract and should be used as the source of truth for verification and dashboard design.

| Intent    | Detail Level | rag:root                   | context:selection | rag_retrieval_stage | answer:llm |
| --------- | ------------ | -------------------------- | ----------------- | ------------------- | ---------- |
| knowledge | minimal      | (implementation-dependent) | ❌                | ❌                  | ✅         |
| knowledge | standard     | ✅                         | ✅                | ❌                  | ✅         |
| knowledge | verbose      | ✅                         | ✅                | ✅                  | ✅         |
| chitchat  | any          | ❌                         | ❌                | ❌                  | ✅         |

**Notes**

- `rag:root` and `context:selection` are only emitted for `intent="knowledge"` when a Langfuse trace exists.
- `context:selection` is emitted in **standard** and **verbose** detail levels.
- `rag_retrieval_stage` is **always verbose-only**, regardless of intent.
- `answer:llm` is emitted for all intents when a trace exists.
- `detailLevel="minimal"` is intended for cost-sensitive production traffic and may omit most RAG-related observations.

## Retrieval Summary (Request-Level)

When intent is `"knowledge"`, the following observations are emitted:

- **Observation Name**: `rag:root`
  - `finalK`, `candidateK`, `topKChunks`, `retrievedCount`, `droppedCount`
  - `similarityThreshold`, `highestScore`, `includedCount`, `insufficient`
  - `autoTriggered`, `winner`, `multiQueryRan`

- **Observation Name**: `context:selection` (standard + verbose)
  - `quotaStart`, `quotaEndUsed`, `uniqueDocs`, `droppedByDedupe`, `droppedByQuota`
  - `mmrLite`, `mmrLambda`
  - `selectionUnit`, `inputCount`, `uniqueBeforeDedupe`, `uniqueAfterDedupe`, `finalSelectedCount`
  - `docInputCount`, `docUniqueBeforeDedupe`, `docUniqueAfterDedupe`, `docDroppedByDedupe`

  Note: `droppedByDedupe` is always measured in the current `selectionUnit`.

## Langfuse Scores for Retrieval Quality

Langfuse cannot average arbitrary observation metadata, so we emit dedicated Score events that can be aggregated safely via the Scores view:

- `retrieval_highest_score` (value = `highestScore`, emitted when a Langfuse trace exists and the value is finite)
- `retrieval_insufficient` (binary 1/0 that mirrors the `insufficient` flag)
- `context_unique_docs` (optional count of unique documents when selection metadata is available)

These scores reuse the existing trace (no new trace creation) and never include raw question text or other PII.

Scores emitted: `retrieval_highest_score` (+ optional `retrieval_insufficient`, `context_unique_docs`).

## Generation Summary

- **Observation Name**: `answer:llm`
  - `provider`, `model`, `responseCacheHit`, `aborted`

## Response Summary (Request-Level)

- **Observation Name**: `response-summary`
  - `requestId` (server-generated identifier)
  - `questionHash`, `questionLength`
  - `eventCount`

## Retrieval Telemetry (Verbose Mode)

This observation is **never emitted** in `detailLevel="standard"` or `"minimal"`, even for knowledge intent.

When `detailLevel` is `"verbose"`, detailed retrieval-stage spans are emitted.

- **Observation Name**: `rag_retrieval_stage`
- **Metadata Fields**:
  - `stage`: e.g., `raw_results`, `after_weighting`
  - `engine`: `native` or `langchain`
  - `presetKey`, `configHash`, `configSummary`
  - `entries`: An array of up to **8** sanitized document metadata entries.
    - Fields: `doc_id`, `similarity`, `weight`, `finalScore`, `doc_type`, `persona_type`, `is_public`

> [!IMPORTANT]
> To protect PII and keep trace sizes small, actual chunk text or URLs are **never** included in Langfuse retrieval spans.

Full configs are not emitted in standard or verbose mode to reduce payload size and minimize PII risk.

### Config Hash & Summary

The `configHash` is a stable SHA256 hash representing a minimal, safe summary of the retrieval configuration. Identical effective configs produce identical hashes, while meaningful changes (e.g., updates to `rag.topK`) result in a different hash. Full configuration details are intentionally excluded from telemetry payloads to reduce size and avoid exposing sensitive information.

## PII Policy (Explicit)

- Raw question text is excluded by default.
- It is only included when `LANGFUSE_INCLUDE_PII="true"`.
- No chunk text or URLs are included in retrieval telemetry.

## `rag_retrieval_stage` vs `rag:root`

- Use `rag:root` and `context:selection` for dashboards/ops summaries.
- Use `rag_retrieval_stage` only for deep debugging of retrieval internals.

## Suggested Langfuse Dashboards

You can build insights by filtering/grouping on trace metadata and observation fields:

1. **RAG Config Usage Overview**
   - Group by `metadata.chatConfig.presetKey`, `metadata.chatConfig.rag.chatEngine`, `metadata.chatConfig.rag.ranker`
   - Metrics: count, error rate, average latency.

2. **Doc Type & Persona Impact**
   - Use retrieval entries to see how often each `doc_type` or `persona_type` appears in top-K.
   - Correlate with `metadata.chatConfig.rag.ranking.docTypeWeights` to tune your ranking logic.

3. **Cache Effectiveness**
   - Monitor `metadata.cache.responseHit` and `metadata.cache.retrievalHit` ratios.
   - Segment by `metadata.presetId` (or `metadata.chatConfig.presetKey` when present).

4. **Latency Breakdown**
   - Plot latencies for different stages (`raw_results` vs `ranking`).
   - Segment by `chatEngine` and `ranker` to identify bottlenecks.

5. **Guardrail Routing**
   - Segment by `metadata.chatConfig.guardrails.route` when config snapshots are enabled.
