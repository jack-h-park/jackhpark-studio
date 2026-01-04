# Engine parity report

## Current state (LangChain only)

- `/api/chat` resolves every request via `loadChatModelSettings` (`lib/server/chat-settings.ts`), picks the preset/session/running model, and dispatches directly to `pages/api/langchain_chat.ts`, so there is only one execution engine in production. The runtime still respects `requireLocal`, `safeMode`, and `features` flags for guardrails and telemetry.
- LangChain execution is orchestrated inside `lib/server/api/langchain_chat_impl_heavy.ts`, which builds guardrail snapshots (`chat-guardrails.ts`), enforces budgets, hits the retrieval cache, and streams through LangChain `Runnable`s.
- Safe Mode (per-preset `safeMode=true`) turns on conservative defaults, disables retrieval/hyde/reranker, clamps context/history budgets, sets `citationsCount=0`, and emits `safe_mode=true` metadata while still returning a response.

## Safe Mode fallback coverage

| Capability | Behavior when `safeMode=true` |
| --- | --- |
| Retrieval | The `ComputeRagContext` short-circuits before any vector search (`routingDecision.intent === "knowledge" && !safeMode`). No citations are emitted, and `retrieval_cache_hit` remains `false`.
| Enhancements | Reverse RAG, HyDE, multi-query, and the reranker are forced off (`lib/server/api/langchain_chat_impl_heavy.ts:1983-2006`), preventing extra API calls.
| Budgets | Context/history budgets are capped at `SAFE_MODE_CONTEXT_TOKEN_BUDGET = 600` / `SAFE_MODE_HISTORY_TOKEN_BUDGET = 300` (`lib/server/chat-guardrails.ts`). This keeps tokens low even if safe mode is triggered frequently.
| RequireLocal | Enforcement is unchanged—`loadChatModelSettings` still returns the proper `enforcement` payload (`error_category=local_required_unavailable`) when a local backend is missing and `requireLocal=true`.
| Telemetry | `safe_mode=true` flows through `buildRuntimeTelemetryProps` and `telemetryBuffer`, alongside the existing `latency_ms`, cache flags, `rag_enabled`, and `status` fields, keeping dashboards stable.

## Telemetry & observability notes

- The `chat_completion` PostHog event name has not changed (per constraints). Its payload still contains `latency_ms`, `aborted`, `response_cache_hit`, `retrieval_cache_hit`, `response_cache_enabled`, `retrieval_cache_enabled`, `rag_enabled`, and `status`, with `safe_mode` appended.
- Langfuse metadata mirrors guardrail snapshots, cache metadata, decision telemetry, and the `safe_mode` flag so traces reveal exactly why the runtime chose the conservative path.
- Smoke scripts (`scripts/smoke/chat-api-smoke.ts`, `scripts/smoke/smoke-langchain-chat.mjs`, `scripts/smoke/prewarm-langchain-chat.mjs`) exercise `/api/chat` and can toggle safe mode to confirm the fallback path remains responsive.

## Takeaways

- The only execution path is LangChain. Safe Mode is the operational fallback that keeps chat responding when vector/guardrail dependencies misbehave.
- Keep telemetry dashboards keyed by `llmEngine` and watch for `safe_mode=true` spikes so you can react to degraded retrieval without losing a response.
- Continue running `pnpm smoke:chat` (and rerun with `safeMode=true`) whenever you ship guardrail or telemetry changes.
