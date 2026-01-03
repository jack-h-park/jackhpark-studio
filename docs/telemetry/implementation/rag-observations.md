# RAG Telemetry Observations: rag:root & context:selection

## Why these observations exist
- **Answer quality questions**: `rag:root` summarizes how many candidates survived retrieval vs how many were dropped, what similarity threshold was enforced, and whether strategy helpers (auto rewrite/hyde/multi-query) changed the retrieval footprint. `context:selection` focuses on the dedupe/quota/MMR work that actually tunes the final context.
- **Separate phases for clarity**: Retrieval and selection have different failure modes (too few results, duplicate chunks, political quotas), so the observations split the telemetry to make dashboards and oncall checks easier.
- **Non-LLM teams need context**: These observations let dashboard owners and engineers gauge RAG health without storing prompts or chunk text.

## Pipeline overview
1. **Retrieval** runs via `lib/server/api/langchain_chat_impl_heavy.ts` → `lib/server/langchain/ragRetrievalChain.ts`, emitting `rag:root` once the context window completes.
2. **Filtering & dedupe** happen inside `buildContextWindow` (`lib/server/chat-guardrails.ts`); it sorts, fingerprints, and clamps documents before quota-aware selection.
3. **Selection + quotas** retains the best `finalK` chunks while keeping per-document quotas, mmr-lite adjustments, and token budgets in check.
4. **LLM context** uses the selected chunks for generation. `context:selection` closes after selection metadata is captured and the final chunk list is handed to the model.

## Observation: rag:root
### Purpose
`rag:root` summarizes the retrieval pass that feeds the context window. It reports how many candidates were fetched (`retrievedCount`), how many stayed in the final list, and whether any auto/alt retrieval strategy paths won over the base path.

### Field reference table
| Field | Type | Meaning | Typical range | Notes |
| --- | --- | --- | --- | --- |
| `finalK` | number | Sanitized `guardrails.ragTopK`, the desired chunk budget enforced by guardrails. | `>= 1` (often 2-10 in presets). | Sanitized via `sanitizeChatSettings` (at least 1). |
| `candidateK` | number | Search multiplier (`5× finalK`, clamped to `[20, 80]`) used when fetching vectors before pruning. | `20-80` | Defined in `langchain_chat_impl_heavy.ts` lines 705‑713. |
| `topKChunks` | number | The larger of `finalK` and `retrievedCount`, used for citation union payload sizing. | `finalK ≤ topKChunks ≤ retrievedCount`. | Ensures downstream citation logic sees a consistent upper bound (lines 1063‑1077). |
| `similarityThreshold` | number | Guardrail similarity cutoff after sanitization (`[0,1]`). | `0.05-0.9` (configurable). | Clamped by `getChatGuardrailConfig` (lines 238‑266). |
| `retrievedCount` | number | Number of raw (deduped) chunks retrieved, including those dropped later. | `finalK ≤ retrievedCount ≤ candidateK`. | `contextResult.included.length + droppedCount` (lines 1063‑1065). |
| `droppedCount` | number | Items removed between retrieval and inclusion. | `>= 0`. | Derived from `contextResult.dropped` (line 1063). |
| `highestScore` | number | Top similarity score among sorted candidates (rounded to 3 decimals). | `>= 0` (typically ≤ 1). | Computed from `chunkDedupe.dedupedDocs` (lines 747‑758). |
| `includedCount` | number | Number of chunks that survived token/quota/MMR filtering. | `0 ≤ includedCount ≤ finalK`. | `contextResult.included.length` (line 1063). |
| `insufficient` | boolean | `true` if no chunk met the threshold or selection yielded zero chunks. | `true/false`. | Set when `highestScore < similarityThreshold` or `includedCount === 0` (lines 756‑759). |
| `autoTriggered` | boolean | `true` when auto rewrite or hyde was run because the base retrieval was deemed weak. | Defaults to `false`. | Set inside `autoDecisionMetrics` (lines 837‑900). |
| `winner` | string or `null` | `base` or `auto` depending on which retrieval pass was selected (null when auto/multi disabled). | `base`, `auto`, or `null`. | Determined after scoring auto vs base candidates (lines 894‑924, 1036‑1044). |
| `multiQueryRan` | boolean | `true` if the merged candidate path executed (auto + base combined). | Defaults to `false`. | Updated when multi-query merges run (lines 960‑1017, 1036‑1044). |

### Strategy signals
- `autoTriggered` indicates the auto path triggered because base retrieval looked weak (checked via `isWeakRetrieval` and `shouldSuppressAuto`).
- `winner` shows whether the auto pass or the base pass fed the context window; dashboards can split latency/quality by winner.
- `multiQueryRan` flags that a merged candidate list (base + auto) was sent, which usually means merged selection data differs from the single-pass path.

### Common debugging patterns
- **`retrievedCount ≫ includedCount`** suggests downstream selection (quota, tokens, dedupe) trimmed out many candidates. Inspect `context:selection.droppedByQuota` or `droppedByDedupe`.
- **`insufficient=true`** even with a decent `highestScore` might mean every candidate was clipped by a token budget or duplicates, leaving zero final chunks.
- **`multiQueryRan=true` with identical `retrievedCount`/`includedCount`** usually means the merge happened but selection converged to the same list; check `context:selection` for whether `quotaEndUsed` grew.

## Observation: context:selection
### Purpose
`context:selection` reports how chunk fingerprints, per-document quotas, token budgets, and MMR-lite bias sculpt the list handed to the LLM. It is emitted whenever selection metadata is available (standard/verbose detail levels).

### Field reference table
| Field | Type | Meaning | Typical range | Notes |
| --- | --- | --- | --- | --- |
| `quotaStart` | number | Initial per-document chunk allowance (`DEFAULT_MAX_CHUNKS_PER_DOC = 2`). | `2`. | Hard-coded constant in `buildContextWindow` (lines 633‑640). |
| `quotaEndUsed` | number | The highest per-document quota used before selection stopped. | `2-6`. | Loops up to `MAX_RELAXED_CHUNKS_PER_DOC = 6` (lines 729‑745). |
| `droppedByDedupe` | number | Chunks discarded before selection because their fingerprint had already appeared. | `>= 0`. | Fingerprint-based chunk dedupe (`dedupeSelectionDocuments`, lines 621‑677). |
| `droppedByQuota` | number | Chunks skipped because their document already hit the current per-doc quota. | `>= 0`. | Counts during `selectWithQuota` when `docCount >= quota` (lines 672‑709). |
| `uniqueDocs` | number | Final count of unique doc IDs in the selection. | `>= 1` when there is at least one chunk. | Value of `docCounts.size` after the last quota pass (line 720). |
| `mmrLite` | boolean | Always `true` to signal the simplified MMR bias in `selectWithQuota`. | `true`. | Set alongside `mmrLambda` in `buildContextWindow` (line 788). |
| `mmrLambda` | number | Penalty weight (`MMR_LITE_LAMBDA = 0.15`) used when re-selecting from the same document. | `0.15`. | See `effectiveScore = relevanceScore - λ * similarityToSelected` (lines 681‑685). |
| `selectionUnit` | string | `"chunk"`, since deduplication runs on chunk fingerprints first. | `"chunk"`. | Comes from `chunkDedupe.selectionUnit` (line 777). |
| `inputCount` | number | Number of candidates fed into the chunk dedupe pass. | `>= uniqueBeforeDedupe`. | `chunkDedupe.inputCount` (line 777). |
| `uniqueBeforeDedupe` | number | Distinct chunk fingerprints seen before filtering. | `<= inputCount`. | `chunkDedupe.uniqueBeforeDedupe` (line 778). |
| `uniqueAfterDedupe` | number | Fingerprints remaining after chunk dedupe. | `<= uniqueBeforeDedupe`. | `chunkDedupe.uniqueAfterDedupe` (line 779). |
| `finalSelectedCount` | number | Number of chunks actually sent to the LLM context. | `≤ finalK`. | `included.length` returned from `buildContextWindow` (line 781). |
| `docInputCount` | number | Documents seen by the doc-level dedupe pass. | `>= docUniqueBeforeDedupe`. | Derived from `docDedupe.inputCount` (line 783). |
| `docUniqueBeforeDedupe` | number | Unique document IDs before doc-level dedupe. | `<= docInputCount`. | `docDedupe.uniqueBeforeDedupe` (line 784). |
| `docUniqueAfterDedupe` | number | Documents remaining after doc dedupe. | `<= docUniqueBeforeDedupe`. | `docDedupe.uniqueAfterDedupe` (line 785). |
| `docDroppedByDedupe` | number | Documents eliminated by doc-level deduplication. | `>= 0`. | `docDedupe.droppedByDedupe` (line 786). |

### Chunk vs document deduplication
- Chunk dedupe fingerprints each chunk using `fingerprintChunk` and keeps the first instance; `selectionUnit` remains `"chunk"`.
- Document dedupe later uses `resolveDocId` to group chunks by URL/IDs, tracking `docSelection.*` counters for dashboards that need doc-level uniqueness.

### Token quota mechanics
- Selection runs `selectWithQuota(quota)` starting at `quotaStart = 2` and incrementing up to `MAX_RELAXED_CHUNKS_PER_DOC = 6` until `finalK` chunks survive (lines 729‑745).
- `quotaEndUsed` captures the last quota attempted; a value above 2 means the pipeline had to relax the per-doc limit to fill `finalK`.
- `droppedByQuota` counts how many candidates were skipped because they exceeded the per-doc limit, so a high value with a high `quotaEndUsed` indicates one doc was dominating results.

### MMR-lite explanation (mmrLite, mmrLambda)
- Every candidate’s `effectiveScore` subtracts `MMR_LITE_LAMBDA (0.15)` when its document already contributed a chunk, so the pipeline gently prefers new docs over duplicates (lines 681‑685).
- `mmrLite=true` is a hard-coded flag shared in telemetry so dashboards know the penalty is “lite” and how to interpret `mmrLambda`.

### Common debugging patterns
- **`uniqueBeforeDedupe == uniqueAfterDedupe` but `droppedByDedupe` high** implies many exact duplicates were removed, not just unique doc counts; inspect `docDroppedByDedupe` for doc-level dedupe.
- **`finalSelectedCount < finalK`** can happen when token budgets (`ragContextTokenBudget`) force the loop to skip candidates (see the early `continue` in lines 698‑705). Check `topKChunks` in `rag:root` to see if retrieval supplied enough raw candidates.
- **`droppedByQuota` dominating selection** often pairs with `quotaEndUsed > quotaStart`, indicating the pipeline had to relax per-doc limits repeatedly; you can correlate with `rag:root.retrievedCount` to understand candidate depth.

## Relationship between observations
- `rag:root` feeds `context:selection`: the retrieval pass returns `contextResult`, and the selection metadata emitted right after gives the post-filtering stats that the LLM actually receives.
- `finalK` (from `rag:root`) is the *target* chunk count, while `finalSelectedCount` is what actually made it past dedupe/quota/token checks; disparities signal budget/dedup pressure.
- Use `rag:root.insufficient` + `context:selection.finalSelectedCount` to quickly tell if retrieval failure or selection tightening caused an empty context.

## Interpretation examples
1. **`finalK` high but `finalSelectedCount` low**: Retrieval supplied enough candidates, but selection dropped many for dedupe/quota/token reasons (check `droppedByDedupe`, `droppedByQuota`, and `quotaEndUsed`). This almost always means tokens or per-doc caps prevented reaching the target.
2. **`highestScore` high but `insufficient=true`**: The best candidate met the similarity threshold, but no chunk survived selection (maybe the token budget clipped everything). The telemetry flags this as insufficient to highlight the gap between raw scores and final context.
3. **`droppedByDedupe` unusually high**: The chunk fingerprint dedupe removed many chunks before selection, so you are seeing duplicates/near-duplicates in the retrieval return; check the trace log emitted via `ragLogger.debug`.
4. **`droppedByQuota` dominating selection**: A large majority of candidate drops came from per-document quotas (`quotaEndUsed > quotaStart`). It means a single document had many eligible chunks, forcing the selection loop to skip extras even if they had good relevance.

## Implementation references
- `lib/server/api/langchain_chat_impl_heavy.ts` (lines ~705‑1115): builds `ragRootMetadata`, gathers scores, and emits the `rag:root` observation once the context window finishes.
- `lib/server/langchain/ragRetrievalChain.ts` (lines ~584‑650): calls `buildContextWindow`, emits `context:selection`, and surfaces the computed metadata when `includeSelectionMetadata` is true.
- `lib/server/chat-guardrails.ts` (lines ~609‑790): implements `buildContextWindow`, chunk/doc dedup, quota loop, `insufficient` flag, and `mmrLite` adjustment that populate the observation fields.
- Observation name strings: `rag:root`, `context:selection`.

## Stability & evolution notes
- When retrieval or quota logic changes, update `rag:root` field descriptions by re-reading `lib/server/api/langchain_chat_impl_heavy.ts` near the `ragRootMetadata` assignment and the `autoDecisionMetrics` block.
- Changes to selection metrics require editing `lib/server/chat-guardrails.ts` (especially the quota loop and dedupe helpers) and `lib/server/langchain/ragRetrievalChain.ts` where metadata is emitted.
- Dashboards should treat these fields as the source of truth, not the older `rag_retrieval_stage` spans, so any field additions go through this canonical doc first.
