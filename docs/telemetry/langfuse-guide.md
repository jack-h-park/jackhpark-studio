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
- `metadata.rag.retrieval_attempted` (true when the retrieval pipeline runs, knowledge intent only)
- `metadata.rag.retrieval_used` (true when retrieval results actually feed the response, knowledge intent only)
- `chatConfig` (and `ragConfig` alias when a config snapshot is emitted)

Raw question text is excluded by default. It is only included when `LANGFUSE_INCLUDE_PII="true"`.

`metadata.cache.responseHit` and `metadata.cache.retrievalHit` are the canonical cache flags; the legacy top-level `responseCacheHit` mirrors the same value for backwards compatibility. Runtime facts (retrieval attempts/usage) belong under `metadata.rag.*`, keeping `chatConfig`/`ragConfig` configuration-only. For non-knowledge intents this runtime block is omitted so dashboards don’t misinterpret RAG state.

## Trace Input/Output (PII-Safe Summaries)

To avoid Langfuse "missing input/output" warnings without storing raw prompts or responses:

- **Trace input** includes `intent`, `model`, `topK`, `history_window`, `question_length`, `settings_hash` (no raw question text).
- **Trace output** includes `answer_chars`, `citationsCount`, `cache_hit`, `insufficient`, `finish_reason`, `error_category`.
  - On cache hits, `insufficient=true` is inferred only when retrieval was attempted/used and `citationsCount` is 0.

Model response text is never stored on the trace.

Additionally, the `answer:llm` observation spans the full generation lifecycle, including streaming. It always has a non-zero duration and closes correctly on success, abort, or error with appropriate `finishReason` and `aborted` fields to represent the completion semantics accurately.

## Generation Events

Every request emits a Langfuse **Generation** event named `answer:llm` so that the Input/Output panels show a meaningful summary without storing raw prompts or retrieved content.

### Generation input (PII safe)
- `requestId`
- `intent` (e.g., `knowledge` / `chitchat`)
- `questionHash`
- `questionLength`
- `presetId`
- `provider`
- `model`
- `configHash` (when a config snapshot is available)
- `telemetry.detailLevel`
- When `intent="knowledge"` and the RAG pipeline runs: `ragTopK`, `similarityThreshold`, `rankerMode`, `reverseRagEnabled`, `hydeEnabled`
- Raw question text is included **only** when `LANGFUSE_INCLUDE_PII="true"`

The generation helper guarantees that `intent`, `model`, `topK`, and `settings_hash` are populated (falling back to `unknown`/stitched values) so Langfuse’s Input/Output panels never see `null`. `topK` is only emitted for knowledge traces, while `settings_hash` uses the config snapshot hash or a stable hash of the sanitized summary when no snapshot is available.

### Generation output (PII safe)
- `finish_reason` (`success`, `error`, `aborted`, etc.)
- `aborted` (`true` when the request was canceled)
- `error_category` (if any)
- `cache_hit`
- `answer_chars`
- `citationsCount`
- `insufficient` (boolean or `null` for chitchat)

Latency is measured from the actual LLM generation window (`startTime` / `endTime`) when available, so dashboards can chart generation duration even during streaming.

## Tags (UI-only, Derived)

### Tags (UI-only)

Every Langfuse trace receives a small, derived tag set so dashboards can safely break down traffic without depending on bespoke metadata queries.

Emitted tags:

- `intent:<intent>` — the request routing intent (`knowledge` / `chitchat` / `command`).
- `preset:<presetKey>` — the active chat preset used for the request.
- `env:<environment>` — the runtime environment (`dev` / `preview` / `prod`).

Notes:

- Tags are low-cardinality, human-readable mirrors of canonical metadata; they are not the source of truth.
- All rich telemetry (response summaries, cache results, scores) still lives in trace metadata and Scores.
- Tags exist purely to stabilize Langfuse UI breakdowns, so dashboards should query metadata for filters and rely on tags for category/grouping.

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

## Runtime Facts vs Config Snapshots

Configuration snapshots stay under `chatConfig`/`ragConfig`; runtime facts live under `metadata.rag.*`. This keeps dashboards from confusing stable config with per-request behavior.

- `metadata.rag.retrieval_attempted` is true whenever the retrieval pipeline actually runs (knowledge intent only).
- `metadata.rag.retrieval_used` is always boolean for knowledge traces (true when retrieval results contribute to the context, false when the pipeline runs but nothing is used). It is absent for chitchat to avoid signaling RAG metrics when they don’t apply.

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

  See [RAG Telemetry Observations: rag:root & context:selection](./rag-observations.md) for field meanings, debugging examples, and implementation references.

  Note: `droppedByDedupe` is always measured in the current `selectionUnit`.

## Langfuse Scores for Retrieval Quality

Langfuse cannot average arbitrary observation metadata, so we emit dedicated Score events that can be aggregated safely via the Scores view without storing sensitive data.

### Scores emitted
- `retrieval_highest_score` (value = `highestScore`, emitted when a Langfuse trace exists and the value is finite)
- `retrieval_insufficient` (binary 1/0 that mirrors the `insufficient` flag)
- `context_unique_docs` (optional count of unique documents when selection metadata is available)

Each score reuses the existing trace and carries only numeric data; no raw questions, prompts, or retrieved chunks are emitted.

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
