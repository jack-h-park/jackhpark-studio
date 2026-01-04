# Local LLM Operations Checklist

## High-level overview

- Local LLMs exist to keep chat/RAG generations private, low-latency, and usable when cloud APIs are undesired or offline-ish. The runtime can route traffic through either Ollama (`LOCAL_LLM_BACKEND=ollama`) or LM Studio (`LOCAL_LLM_BACKEND=lmstudio`) once an admin preset selects a local model.
- The `LocalLlmClient` abstraction (`lib/local-llm/client.ts`) is backed by `OllamaClient` and `LmStudioClient` (`lib/local-llm/ollama-client.ts`, `lib/local-llm/lmstudio-client.ts`); `getLocalLlmClient`/`getLocalLlmBackend` in `lib/local-llm/index.ts` resolve the backend from `LOCAL_LLM_BACKEND` (or the `x-local-llm-backend` header / `localBackend` query override before calling `loadChatModelSettings`).
- LangChain handles every chat request now, but a preset-level `safeMode` flag turns on a conservative LangChain fallback: retrieval/reverse RAG, HyDE, multi-query, and reranking are disabled, context/history budgets drop to guarded defaults, and the runtime still returns a response even if vector or guardrail dependencies misbehave. This preserves the operational trace (`safe_mode=true`) so you can spot when the fallback path is used.

## Engine & preset model

| Field                   | Notes                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `llmEngine`             | A `ChatEngineType` (`types/chat-config.ts`) that signals where the generation happens (`openai`, `gemini`, `local-ollama`, `local-lmstudio`, or `unknown`). Local engines come from choosing an Ollama- or LM Studio–backed LLM definition and having `LOCAL_LLM_BACKEND` match (`lib/server/chat-settings.ts`).                               |
| `requireLocal`          | Presets expose this flag (`types/chat-config.ts`, `components/admin/chat-config/SessionPresetsCard.tsx`) to lock a flow to a local backend. The runtime surfaces it to the UI (`components/chat/context/ChatConfigContext.tsx`) and enforcement is centralized in `loadChatModelSettings`; the handler returns a 503 with `error_category=local_required_unavailable` when blocked. |
| `localBackendAvailable` | Set when a `LocalLlmClient` exists **and** the resolved model provider is a local engine (Ollama or LM Studio), so the runtime knows streaming can happen locally.                                                                                                                                                                             |
| `fallbackFrom`          | When a local preset runs without an active backend but `requireLocal=false`, we record the original local engine (`local-ollama`/`local-lmstudio`) so telemetry can see the fallback and the resolver substitutes the defaults.                                                                                                                |

- `requireLocal=true` means **no cloud LLM is allowed**. If `localBackendAvailable` is false, `loadChatModelSettings` flags `runtime.enforcement=blocked_require_local` and both engines immediately respond with 503 + the blocked payload (error_category/local_backend_available metadata). Indirect overrides such as header/query-backend still respect this gate because they feed into `loadChatModelSettings`.
- `requireLocal=false` allows a fallback path: if no local client is reachable, `loadChatModelSettings` substitutes the default cloud model and tracks `fallbackFrom` so telemetry (Langfuse/PostHog) can split traffic by `llmEngine`.
- Safe Mode is the new fallback knob for presets that still need to respond when LangChain dependencies misbehave: it forces conservative budgets, turns off retrieval/enhancements, and still streams via LangChain while emitting `safe_mode=true` metadata so you can monitor how often the fallback is engaged.
- Reverse RAG (query rewrite) is invoked inside `pages/api/chat.ts` after the runtime snapshot is resolved. The handler passes `runtime.provider` and `runtime.llmModel` into `rewriteQuery`/`generateHydeDocument` (`lib/server/rag-enhancements.ts`), ensuring the same provider/model combination (local or cloud) handles both inference and the reverse query. This keeps privacy tight and avoids surprising cloud calls when `requireLocal=true`.

## RAG + embeddings

- Chunk retrieval happens through the stable RPC helpers defined in `supabase/sql/rag_wrappers.sql`. `lib/rag/retrieval.ts::matchRagChunksForConfig` calls one of those wrappers (`match_rag_chunks_native_openai`, `match_rag_chunks_native_gemini`, `match_rag_chunks_langchain_openai`, `match_rag_chunks_langchain_gemini`) depending on the mode/embedding provider, so the backend code never talks directly to versioned helpers.
- Embeddings currently live in the cloud only. We keep two providers/tables: OpenAI’s `text-embedding-3-small` and Gemini’s `text-embedding-004` (see `lib/shared/models.ts` for the canonical IDs and aliases). Each embedding space has its own `match_*` wrappers plus Supabase tables so we can query either space independently. `resolveEmbeddingSpace` (`lib/core/embedding-spaces.ts`) centralizes selection, and `lib/server/chat-settings.ts` wires the chosen space into the chat runtime snapshot.
- Future consideration: local embeddings would allow a fully offline stack with zero outbound calls, but they require maintaining a second ingestion/embedding space, re-running chunking, and balancing quality/latency versus the cloud providers. Until we add that, **only generation (LLM completion) can be local; embeddings always come from OpenAI or Gemini.**

## Operational checklist

- **Environment**
  - `LOCAL_LLM_BACKEND` (and any overrides) points to `ollama` or `lmstudio`; confirm this via your shell and by running `scripts/smoke/chat-api-smoke.ts` (or `pnpm smoke:chat`) with `SMOKE_CHAT_PRESET=local-required` so the handler logs the `x-local-llm-backend` override before `loadChatModelSettings` resolves the backend.
  - The corresponding service (Ollama default `http://127.0.0.1:11434`, LM Studio default `http://127.0.0.1:1234/v1`) is running and reachable; `getLocalLlmClient` will pick it up automatically and `loadChatModelSettings` logs `localBackendAvailable=true` when ready.
- **Presets**
  - At least one preset selects a local LLM model (e.g., a definition whose provider is `ollama` from `lib/shared/models.ts`) and logs as `llmEngine=local-ollama`/`local-lmstudio` in `loadChatModelSettings` (`lib/server/chat-settings.ts`).
  - `requireLocal` is set to `true` for strict local usage, or `false` if you are willing to fall back to the cloud; the admin UI (`components/admin/chat-config/SessionPresetsCard.tsx`) toggles the same flag that the runtime exposes in `ChatConfigContext`. Confirm runtime output via the development log in `pages/api/chat.ts` if needed.
  - If reverse RAG should rewrite queries for that preset, confirm `reverseRAG` is enabled in the preset’s `features` block; the rewrite will invoke the same model provider as the preset, keeping privacy aligned.

**Tests**
- `pnpm smoke:chat` (`scripts/smoke/chat-api-smoke.ts`) exercises `/api/chat` with a repeatable prompt/refresh workflow: confirm the SSE stream looks healthy, `x-cache-hit` arrives on the second run, and traces/reporting pick up the request.
- To exercise Safe Mode, toggle `safeMode=true` on a preset (or send `sessionConfig.safeMode=true`) and repeat the smoke run; you should still see a response, zero citations, and telemetry metadata/emitted property `safe_mode=true`.
- **Monitoring**
  - Use Langfuse/PostHog dashboards keyed by `llmEngine` to confirm local vs. cloud traffic separation and to catch spikes in `fallbackFrom` events.
  - Track error rates for “local required but backend missing” events (the handler returns a 500 with `engine/localBackendEnv` metadata) and keep them near zero before shipping.

## Failure modes & troubleshooting

- **`LOCAL_LLM_BACKEND` misconfigured or not set**
- How it shows up: every `requireLocal=true` request currently returns 503 with `error_category=local_required_unavailable` because `loadChatModelSettings` cannot instantiate `LocalLlmClient` and the enforcement payload bubbles to both API handlers. Logs or smoke runs print the blocked payload for `unset`/`invalid` overrides.
- How to fix: mirror the exact string (`ollama` or `lmstudio`), restart the service if necessary, and re-run `pnpm smoke:chat` (or `scripts/smoke/chat-api-smoke.ts`) with `SMOKE_CHAT_PRESET=local-required` so the handler exercises `loadChatModelSettings`; check `lib/local-llm/index.ts` to ensure env parsing is not failing.
- **Ollama/LM Studio process unreachable**
- How it shows up: logs show `localBackendAvailable=false`, the handler logs `local backend required but not available`, and the UI may show a 503 banner for the preset. `loadChatModelSettings` will fall back to cloud only if `requireLocal=false`.
- How to fix: start/restart the respective service (default URLs shown in `lib/local-llm/index.ts`), confirm `getLocalLlmClient` no longer throws, and verify the development log in `pages/api/chat.ts` reports `localBackendAvailable=true`.
- **Reverse RAG errors for local providers**
  - How it shows up: `rewriteQuery`/`generateHydeDocument` log warnings from `lib/server/rag-enhancements.ts` and trace metadata may show the original query instead of a rewrite; this happens because the local reverse-RAG path is still stabilizing.
  - How to fix: the handler gracefully keeps using the original query (no fatal crash) until local reverse-RAG is fully implemented; monitor the guards via Langfuse traces and the console warnings, then update `lib/server/rag-enhancements.ts` to route reverse/query generation through the local client once ready.
