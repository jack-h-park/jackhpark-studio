# RAG System Architecture

**Status:** authoritative  
**Owner:** Engineering  
**Implementation:** `pages/api/chat.ts`, `pages/api/langchain_chat.ts`, `lib/server/api/langchain_chat_impl_heavy.ts`

This document captures how chat requests flow through the unified LangChain runtime, how guardrails are enforced, and how the Safe Mode preset keeps the experience reliable even when downstream dependencies misbehave.

---

## 1. System overview & design principles

- **Single execution engine.** Every chat request now routes through `pages/api/chat.ts`, which calls `loadChatModelSettings` (`lib/server/chat-settings.ts`) and always dispatches to `langchainChat` (no native fallback). Feature flags (`safeMode`, `requireLocal`, retrieval toggles) live in `SessionChatConfig`/admin presets and are respected throughout the LangChain stack.
- **Deterministic guardrails.** Guardrail settings are resolved via `loadGuardrailSettings` + `sanitizeChatSettings` (`lib/server/chat-guardrails.ts`), capturing budgets, retrieval thresholds, and summary behavior so telemetry can compare apples-to-apples across requests.
- **Safe Mode fallback.** A preset-level `safeMode` flag toggles conservative defaults: retrieval/enhancements are skipped, context budgets shrink (see Section 5), and telemetry still emits `safe_mode=true` so operators can monitor when the fallback is active.
- **Telemetry invariants.** The `chat_completion` event name remains stable, and PostHog metadata still reports `latency_ms`, `aborted`, cache booleans, and `status` while `safe_mode` is added as a new property. Langfuse traces mirror the same metadata plus guardrail snapshots.

---

## 2. Request lifecycle

```mermaid
flowchart TD
  Request[User request]
  Config[Load chat settings (`pages/api/chat.ts`)]
  LangChain[LangChain execution (`pages/api/langchain_chat.ts` + `lib/server/api/langchain_chat_impl_heavy.ts`)]
  SafeMode[Safe Mode guardrail tweaks]
  Retrieval[Retrieval + RAG pipeline]
  Response[Stream response]
  Telemetry[PostHog + Langfuse]

  Request --> Config --> LangChain
  LangChain --> Retrieval
  Retrieval --> Response --> Telemetry
  LangChain --> SafeMode --> Retrieval
```

1. **Request intake.** `pages/api/chat.ts` merges preset, session overrides, and environment defaults inside `loadChatModelSettings`, producing a `ChatModelSettings` snapshot that includes `safeMode`, `requireLocal`, `features`, and runtime metadata for telemetry.
2. **LangChain dispatch.** The handler always calls `langchainChat` (`pages/api/langchain_chat.ts` → `lib/server/api/langchain_chat_entry.ts` → `lib/server/api/langchain_chat_impl_heavy.ts`). Guardrail metadata (history budgets, retrieval thresholds, summary levels) and telemetry hooks flow into Langfuse via `telemetryBuffer`.
3. **Guardrail decision.** `routeQuestion`, `applyHistoryWindow`, and `buildRagConfig` decide whether retrieval runs. When Safe Mode is on, retrieval is disabled entirely (see Section 5) and the runtime still streams a response with an empty citation set.
4. **Response streaming.** The LangChain stack streams tokens to the client while writing cache entries (`buildResponseCacheKey`) and emitting `chat_completion` events. Latency/tokens are recorded, and `safe_mode` is tagged whenever `runtime.safeMode` is true.

---

## 3. LangChain execution & guardrails

- **Guardrail resolution.** `sanitizeChatSettings` enforces numeric bounds and summary behavior, while `buildGuardrailSettings` uses admin defaults plus any session overrides. Safe Mode short-circuits budgets (`SAFE_MODE_CONTEXT_TOKEN_BUDGET = 600`, `SAFE_MODE_HISTORY_TOKEN_BUDGET = 300`) so context/history windows stay small under load.
- **Summary handling.** Guardrails trim history to `historyTokenBudget`, optionally generate a summary chunk, and expose metadata (`summaryMemory`, `historyWindow`) to both the prompt builder and telemetry layer.
- **Intent routing.** `routeQuestion` classifies the latest prompt as `knowledge`, `chitchat`, or `command`. The LangChain runtime honors `requireLocal` enforcement regardless of Safe Mode: the policy is resolved inside `loadChatModelSettings`, and if a local backend is missing while `requireLocal=true`, the handler immediately returns a 503 with the `error_category=local_required_unavailable` payload.
- **Telemetry snapshots.** `telemetryBuffer` grabs a snapshot of guardrail settings, guardrail meta, and `runtimeTelemetryProps` (`lib/server/chat-settings.ts`). Langfuse traces and PostHog `chat_completion` events both include these snapshots plus cache flags.

---

## 4. Retrieval & context pipeline

- **Retrieval cache.** When a knowledge intent is detected and Safe Mode is off, `ComputeRagContext` (`lib/server/api/langchain_chat_impl_heavy.ts`) uses a retrieval cache keyed by preset, context, and runtime flags (reverse RAG, HyDE, reranker, etc.). A cache hit skips vector search and still updates telemetry.
- **Reverse RAG / HyDE / reranker.** These enhancements are orchestrated via `buildRagRetrievalChain`. Signals like `reverseRagMode`, `hydeMode`, and `rankerMode` are derived from admin settings, but every decision is captured in telemetry (`decisionSignature`, `decisionTelemetry`) to aid debugging.
- **Vector search.** The handler embeds the (possibly rewritten/HyDE-augmented) query and calls `matchRagChunksForConfig` or the LangChain vector store. Resulting chunks are enriched, filtered, reranked, and trimmed by `buildContextWindow` to respect `ragContextTokenBudget` and `ragTopK`.
- **Context assembly.** `buildIntentContextFallback` guarantees a safe prompt even when retrieval fails. The final context includes system prompt, history window, retrieved chunks, and optional guardrail summaries.

---

## 5. Safe Mode preset (operational fallback)

When `safeMode=true` in the session or preset:
Session overrides are the per-request `sessionConfig` payload that accompanies the `/api/chat` call, and they take precedence over preset defaults and global/admin guardrail values when producing the runtime snapshot.

1.  **No retrieval.** ComputeRagContext short-circuits before vector search (`routingDecision.intent === "knowledge" && !safeMode` guard). Safe Mode guarantees zero outbound vector database calls or reranker requests—only the final LLM generation runs (still respecting `requireLocal`). The runtime still returns a response with the fallbacks assembled by `buildIntentContextFallback`.
2.  **Citations suppressed.** `citationsCount` is forced to `0` in telemetry (`lib/server/api/langchain_chat_impl_heavy.ts:1459`, `2259`, `3026`) so downstream dashboards know no retrieval occurred.
   This deterministic zero communicates that no retrieved context reached the prompt even though metadata like `metadata.rag.retrieval_attempted` / `metadata.rag.retrieval_used` remain the canonical ground truth; `citationsCount=0` is simply the UI-friendly proxy operators can scan for quickly.
3.  **Enhancements disabled.** Reverse RAG, HyDE, multi-query, and reranker toggles are set to their safe defaults (`false`) so no auxiliary network calls happen (see `lib/server/api/langchain_chat_impl_heavy.ts:1983-2006`).
4.  **Budgets reduced.** Context budgets clamp at `SAFE_MODE_CONTEXT_TOKEN_BUDGET = 600` and history budgets at `SAFE_MODE_HISTORY_TOKEN_BUDGET = 300` (`lib/server/chat-guardrails.ts:152-274`).
5.  **RequireLocal still honored.** Safe Mode only affects retrieval/features; `requireLocal` enforcement remains centralized in `loadChatModelSettings`, so local-only presets continue to block when the backend is unavailable.
6.  **Telemetry flag.** `safe_mode=true` appears in every PostHog `chat_completion` event/property set and Langfuse metadata (`buildRuntimeTelemetryProps`, `lib/server/telemetry/telemetry-buffer.ts:122`) so you can measure how often the fallback is active.

Safe Mode is the recommended guardrail for keeping the runtime responsive when vector stores, guardrail services, or hybrid enhancements misbehave.
Operators should prefer enabling Safe Mode when facing:
- vector database latency issues or regional outages,
- reranker failures or high error rates,
- p99 regressions traced back to retrieval-heavy workloads,
- or when debugging with the fewest moving parts possible.

---

## 6. Telemetry & observability

- **PostHog `chat_completion`.** The event name stays unchanged. Payload always includes `latency_ms`, `aborted`, `response_cache_hit`, `retrieval_cache_hit`, `response_cache_enabled`, `retrieval_cache_enabled`, `rag_enabled`, `status`, and now `safe_mode` (never dropped).
- **Langfuse metadata.** Traces mirror guardrail snapshots, decision telemetry, cache state, and `safe_mode`. Cache hits also emit `cacheMeta` updates via `updateTraceCacheMetadata` so Langfuse dashboards can break down response vs. retrieval hits.
- **Monitoring.** The `scripts/smoke/chat-api-smoke.ts` script exercises the unified `/api/chat` endpoint and can toggle Safe Mode to validate the fallback. `scripts/smoke/smoke-langchain-chat.mjs`/`prewarm-langchain-chat.mjs` remain available for deeper LangChain readiness checks.

---

## 7. Operational notes

- Update admin presets (`SessionPresetsCard`) whenever you need new safe mode defaults; the checkbox propagates `safeMode=true` to the runtime snapshot.
- Keep reviewing PostHog dashboards keyed by `llmEngine` to track cloud/local separation and watch for `safe_mode=true` spikes—they signal degraded retrieval but a still-responsive runtime.
- For deep debugging, examine `lib/server/api/langchain_chat_impl_heavy.ts` traces alongside Langfuse spans (`telemetryBuffer`) to understand how guardrail metadata evolves through the request.
