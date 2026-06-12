# PostHog Tracking Inventory

> **Derives from canonical:** [Telemetry alerting contract](../../canonical/telemetry/alerting-contract.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

This document is the authoritative implementation reference for PostHog instrumentation in this codebase. It covers what is instrumented, where, and what is intentionally not tracked. For alert thresholds, signal semantics, and dashboard design, refer to `alerting-contract.md`.

---

## Architecture overview

PostHog is wired up on two sides: a client-side instance (browser) and a server-side instance (Node.js API routes).

| Side | Init location | Purpose |
|------|--------------|---------|
| Client | [`pages/_app.tsx`](../../../pages/_app.tsx) | `$pageview` events on route change |
| Server | [`lib/analytics/posthog.ts`](../../../lib/analytics/posthog.ts) | `chat_completion` events after each LangChain response |

### Environment variables

This table covers the **capture** (write) side used by the app. The digest's **read** side (`POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_API_HOST`) and the full cross-tool matrix live in [setup.md](../setup.md) — the authoritative env reference.

| Variable | Side | Notes |
|----------|------|-------|
| `NEXT_PUBLIC_POSTHOG_ID` | Client (build) | Capture key (`phc_…`) for browser-side init |
| `POSTHOG_API_KEY` | Server | Capture key (`phc_…`) for server-side PostHog client |
| `POSTHOG_HOST` | Server | Optional capture host; defaults to `https://app.posthog.com` |
| `TELEMETRY_ENABLED` | Server | Global kill switch; defaults to `true` |

The server-side client is instantiated once as a module-level singleton. If `TELEMETRY_ENABLED=false` or `POSTHOG_API_KEY` is missing, the client is `null` and all capture calls are no-ops. See `lib/server/telemetry/telemetry-enabled.ts` for the guard.

> Querying product analytics (the weekly digest) needs a **personal** API key (`phx_…`), not the capture key above — see [setup.md](../setup.md#posthog-product-analytics).

---

## Tracked events

### `$pageview` (client-side)

**Trigger:** `router.routeChangeComplete` in `pages/_app.tsx`.

**Properties:** PostHog default autocapture only (`$current_url`, `$referrer`, `$host`, etc.). No custom properties are attached.

**Captured via:** `posthog.capture("$pageview")` — no wrapper function.

---

### `chat_completion` (server-side)

**Trigger:** End of every LangChain chat request (success, error, or abort) in [`lib/server/api/langchain_chat_impl_heavy.ts`](../../../lib/server/api/langchain_chat_impl_heavy.ts) (~lines 683–714).

**Captured via:** `captureChatCompletion()` in `lib/analytics/posthog.ts`.

**Full property reference:**

#### Session / environment

| Property | Type | Description |
|----------|------|-------------|
| `env` | `string` | Runtime environment (`prod`, `dev`, etc.) |
| `chat_session_id` | `string \| null` | Session identifier derived from `x-chat-id` header |
| `preset_key` | `string` | Chat preset configuration key (e.g. `"default"`) |
| `chat_engine` | `"langchain"` | Always `"langchain"` for this path |

#### Model resolution

| Property | Type | Description |
|----------|------|-------------|
| `provider` | `string \| null` | LLM provider (e.g. `"openai"`, `"gemini"`) |
| `model` | `string \| null` | Model ID as resolved (e.g. `"gpt-4o"`) |
| `embedding_model` | `string \| null` | Embedding model ID used for retrieval |
| `resolved_provider` | `string` | Final provider after fallback resolution |
| `resolved_model_id` | `string` | Final model ID after fallback resolution |
| `requested_model_id` | `string \| null` | Model ID the caller originally requested |

#### RAG / retrieval

| Property | Type | Description |
|----------|------|-------------|
| `rag_enabled` | `boolean` | `true` when `ragTopK > 0`; used as `intent=knowledge` proxy in PostHog (see alerting-contract §Observability prerequisites) |
| `retrieval_attempted` | `boolean \| null` | Whether retrieval was attempted this request |
| `retrieval_used` | `boolean \| null` | Whether retrieved chunks were included in the final prompt |
| `retrieval_cache_hit` | `boolean` | `true` when the retrieval cache satisfied the request |
| `retrieval_cache_enabled` | `boolean` | Whether retrieval caching was configured for this request |

#### Performance

| Property | Type | Description |
|----------|------|-------------|
| `latency_ms` | `number` | Handler entry → request completion latency (canonical p99 signal for Alert A) |
| `latency_llm_ms` | `number \| null` | LLM generation latency only |
| `latency_retrieval_ms` | `number \| null` | Retrieval chain latency only |
| `total_tokens` | `number \| null` | Total tokens consumed (prompt + completion) |

#### Cache

| Property | Type | Description |
|----------|------|-------------|
| `response_cache_hit` | `boolean` | `true` when a cached response was served without invoking the LLM |
| `response_cache_enabled` | `boolean` | Whether response caching was configured for this request |
| `cache_strategy` | `"early" \| "late" \| null` | Response-cache coordinator strategy; `null` when no cache decision was made. Provides Alert C cache attribution without a separate `cache_decision` event |

#### Guardrails / routing

| Property | Type | Description |
|----------|------|-------------|
| `guardrail_route` | `string` | Guardrail classification result: `"normal"`, `"chitchat"`, or `"command"` |
| `prompt_version` | `string` | System prompt version string |

#### Runtime backend selection

| Property | Type | Description |
|----------|------|-------------|
| `require_local` | `boolean` | Whether the request required a local backend |
| `local_backend_available` | `boolean` | Whether a local backend was reachable at request time |
| `enforcement` | `string` | Enforcement level for local/remote selection |
| `fallback_from` | `string \| null` | Original provider if a fallback was triggered |
| `wants_local_engine` | `boolean` | Whether the user requested a local engine |
| `safe_mode` | `boolean` | Whether safe mode was active (disables external tools/retrieval) |

#### Outcome

| Property | Type | Description |
|----------|------|-------------|
| `status` | `"success" \| "error"` | Request outcome |
| `aborted` | `boolean` | Whether the client aborted the request mid-stream |
| `error_type` | `string \| null` | Short classifier; one of `"timeout"`, `"unauthorized"`, `"local_llm_unavailable"`, `"network_error"`, `"upstream_error"` |
| `error_category` | `string \| undefined` | Broader category of the error if applicable |

#### Trace linkage

| Property | Type | Description |
|----------|------|-------------|
| `trace_id` | `string \| null` | Langfuse `traceId` of this request, sourced from `traceState.trace?.traceId`. `null` when no trace was emitted (telemetry disabled or sampled out). Enables joining PostHog events back to the Langfuse trace. |

---

## Distinct ID resolution

Server-side events resolve `distinct_id` in priority order:

1. `x-user-id` request header
2. `x-anonymous-id` request header
3. `x-chat-id` header (chat session ID)
4. `x-request-id` header (fallback request ID)

Resolution logic lives in `resolvePosthogDistinctId()` in `langchain_chat_impl_heavy.ts` (~lines 645–657).

> Because `posthog.identify()` is never called, PostHog cannot stitch client-side pageviews to server-side chat events by the same user. Session-level analysis is currently limited to the `chat_session_id` property on `chat_completion` events.

---

## What is NOT tracked

| Capability | Status | Notes |
|-----------|--------|-------|
| `posthog.identify()` | Not used | No user identity is set; PostHog cannot build person profiles or cross-session cohorts |
| `posthog.group()` | Not used | No group (org/team) analytics |
| Feature flags | Not used | Internal feature config uses `sessionConfig.features` (reverseRAG, hyde, ranker); these are not PostHog feature flags |
| UI interaction events | Not captured | Button clicks, RAG feedback, error modal interactions, settings changes are not tracked |
| Ingestion lifecycle events | Not captured | No events for Notion sync start/end, embedding run, or document upsert |

---

## Known gaps

### No identity stitching

Client-side `$pageview` events and server-side `chat_completion` events share no common identity because `posthog.identify()` is never called. This means funnel analysis (e.g. "what pages did this user visit before their first chat?") is not possible with current instrumentation.

### Latency & cache attribution live on `chat_completion` (by design)

Earlier contract drafts specified separate `cache_decision` and `latency_breakdown` event types. These were never emitted, and the data fully duplicates `chat_completion` properties (`latency_retrieval_ms`, `latency_llm_ms`, `response_cache_hit`, `retrieval_cache_hit`, `cache_strategy`). The contract was reconciled to source Alert A/B/C from `chat_completion` directly — no separate events, no cross-event joins. This is intentional, not a gap.

---

## Related documents

- [`alerting-contract.md`](../../canonical/telemetry/alerting-contract.md) — canonical event taxonomy, signal semantics, and alert thresholds
- [`posthog-ops.md`](../posthog-ops.md) — PostHog dashboard tiles and alert configuration (Step 3)
- [`dashboards/posthog-dashboard.md`](../dashboards/posthog-dashboard.md) — insight descriptions and diagnostic guidance
- [`telemetry-logging.md`](./telemetry-logging.md) — Langfuse and server logging architecture
