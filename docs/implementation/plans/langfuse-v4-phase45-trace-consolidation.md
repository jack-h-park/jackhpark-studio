# Langfuse v4 — Phase 4/5 Design: Ingestion Rewrite and Trace Consolidation

Companion to [langfuse-v4-migration-plan.md](langfuse-v4-migration-plan.md).
Phase 3 shipped in #110. This document answers the two questions that were
blocking Phase 4, both by reading the code rather than inferring from traces.

## Question 1: what emits each span today?

Measured on production 2026-08-26 (20 observations, three traces), then traced
back to source.

| Trace                 | Opened by                                                                                                                                                    | Observations                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `langchain-chat`      | [telemetry-buffer.ts:78](../../../lib/server/telemetry/telemetry-buffer.ts) — `createTrace()`, id pinned to `requestId`                                      | `rag:root`, `hyde`, `context:selection`, `answer:llm`, `answer:stream`, `response-summary` |
| `rag-retrieval-graph` | `langfuse-langchain` `CallbackHandler` via [buildLinkedLangfuseCallbacks](../../../lib/server/langchain/langfuse-callbacks.ts), attached to `graph.invoke()` | `__start__`, `rewrite`, `hyde`, `retrieve`, `rerank`, `context`                            |
| `answer:root`         | the same handler mechanism on the answer chain                                                                                                               | `answer:prompt`, `answer:llm`, `ChatOpenAI`                                                |

The split is not accidental. The comment on `runRagRetrieval` states it
outright: the handler "cannot attach to our custom LangfuseTrace, which is not a
LangfuseTraceClient", so node spans land in a separate trace correlated by
`sessionId` and a `linkedTraceId` metadata field.

## Question 2: are the duplicated names the same work?

The two names that appear in more than one trace have **different answers**, and
the difference decides how each is handled.

### `hyde` — same operation, two nesting levels

- The LangGraph node `hyde` ([rag-retrieval-chain.ts:766](../../../lib/server/langchain/rag-retrieval-chain.ts))
  wraps `hydeStage(...)`. The `CallbackHandler` emits it into the graph trace.
- Inside `hydeStage`, `maybeSpan({ name: "hyde" })` wraps the actual
  `generateHydeDocument(...)` call and writes to the **primary** trace via
  `input.trace`.

So the graph-trace span _contains_ the primary-trace span. They are a
parent/child pair that got severed across two traces because the handler could
not attach to the custom trace.

**Consequence for the merge: keep both.** Once the traces share one OTel
context, they nest naturally and the tree becomes more accurate, not more
redundant. Nothing to deduplicate.

### `answer:llm` — same stage, deliberately different payloads

- [rag-answer-chain.ts:48](../../../lib/server/langchain/rag-answer-chain.ts)
  sets `runName: makeRunName("answer", "llm")` on the LLM runnable. The handler
  emits it into the `answer:root` trace, and `ChatOpenAI` — the GENERATION
  carrying **real token usage and cost** — is its child.
- [langfuse-answer-summary.ts:151](../../../lib/server/telemetry/langfuse-answer-summary.ts)
  emits a separate `answer:llm` **summary span** onto the primary trace: config
  snapshot in, finish semantics out, PII-gated.

The summary is deliberately a SPAN and deliberately carries no `model`. Its
docstring records why: a GENERATION without usage makes Langfuse tokenize
`input`/`output` to infer tokens, and since those are JSON summaries here, that
produced fabricated token counts and double-counted cost against the real
generation.

**Consequence for the merge: keep both, but rename one.** They carry
complementary data and neither is disposable. Today they only avoid colliding
because they live in different traces — merging puts two `answer:llm` spans in
one tree. Rename the summary span (`answer:summary` reads correctly against the
existing `answer:stream` / `answer:prompt` / `answer:root`).

This is the concrete trap in the merge: a naive consolidation that dedupes by
name would drop the summary and keep the generation, silently losing the
finish-reason, cache, and citation telemetry the digest reads.

## Question 3: should Phase 5 come before Phase 4?

**No. Keep 4 → 5.** The concern that prompted this question does not survive
checking.

The worry was that v4 expects a root observation carrying the request's
input/output, and no trace holds the whole request — so Phase 4 would have
nowhere to put it. But the fragmentation is a property of the _legacy_ emission
path, not a fact about the request. Phase 4 creates a new OTel root span that
wraps the whole handler, and that root is a valid target by construction.

The resulting sequence is coherent:

- **Phase 4** rewrites `lib/langfuse.node.ts` onto `@langfuse/tracing`. The
  request gets one real OTel root span; trace-level `input`/`output` move onto
  it. The LangChain handler is untouched and keeps writing its own two legacy
  traces. Intermediate state: 1 OTel trace + 2 legacy traces.
- **Phase 5** swaps `langfuse-langchain` for `@langfuse/langchain`. The v5
  handler participates in the ambient OTel context instead of opening its own
  trace, so its spans nest under the Phase 4 root. Three traces collapse to one.

Doing Phase 5 first would be worse: the v5 handler would try to join an OTel
context that does not exist yet, while the custom trace is still legacy — and
legacy trace ids are dashed UUIDs where OTLP requires 32 hex characters, so the
two could not share a trace id even deliberately.

The intermediate state is acceptable: dashboards see a mix for one phase, and
the legacy endpoint is supported until 2026-11-16.

## What Phase 4 must do

Phase 4 was split during implementation:

- **4a** (#113): the OTel backend added behind `LANGFUSE_OTEL_TRACING`, default off.
- **4b** (#114): `answer:llm` summary renamed to `answer:summary` and routed
  through `trace.observation()`; root closed after the buffer flush.
- **4c** (#114): a second golden snapshot driven by the OTel backend, kept
  alongside the legacy one. The two come out byte-identical.
- **4d step 1** (#143, 2026-09-02): flipped the default. The duplicate-createTrace
  blocker was cleared first by #116. Verified in production — one trace, one real
  root, no synthetic `t-<traceId>` duplicate. Rollback is
  `LANGFUSE_OTEL_TRACING=0`, which works only while the legacy backend is still
  in the tree.
- **4d step 2** (not started): remove the legacy backend, its golden, and the now
  redundant Preview-scope `LANGFUSE_OTEL_TRACING=1`. Deliberately held for a few
  days of production traffic, because deleting the legacy path gives up the
  one-line rollback.

Carried from the migration plan, now with the answers above folded in:

1. Reimplement `lib/langfuse.node.ts` internals over `@langfuse/tracing` while
   preserving the `LangfuseTrace` and `withSpan` signatures — that keeps the ~12
   call sites untouched.
2. Replace the accumulate-and-resend `trace.update()` pattern (11 call sites)
   with in-memory accumulation and a single export on span end. v4 explicitly
   disallows re-ingesting an ID to update it.
3. Move trace-level `input`/`output` onto the new root observation.
4. Drop the `environment` attribute — Phase 3 already set it on the processor
   from `getAppEnv()`.
5. Serialize metadata to `Record<string, string>`, values ≤200 characters.
6. Rewrite `emitAnswerSummarySpan` onto `startObservation` **and rename its span**
   per the `answer:llm` finding above.
7. Rewrite the `TELEMETRY_TEST_SINK` harness against an in-memory OTel exporter
   and refresh the telemetry golden snapshot.

## What Phase 5 must do

1. `langfuse-langchain` → `@langfuse/langchain`.
2. Delete the `linkedTraceId` correlation and the explicit host/key passing —
   both exist only because the v3 handler owned its own client.
3. Delete `handlersByTraceId` and `flushLinkedLangfuseCallbacks`. The v5 handler
   has no `flushAsync()` and no `handler.langfuse` error channel; flushing
   consolidates into `flushLangfuseSpans()`, already wired in Phase 3.
4. Confirm `__start__` and other LangGraph internals still pass the v5 default
   span filter. They are LangChain-scope spans, not `langfuse-sdk` spans, so
   this is worth verifying rather than assuming.

## Blocker for Phase 4d: createTrace runs twice per request

Found on preview 2026-08-27 with `LANGFUSE_OTEL_TRACING=1`. One chat produced
the expected tree — root `langchain-chat` (`801be2b30d84f57d`) with five
children correctly parented to it — except `response-summary`, whose parent
`640db40b44e0fa72` **does not exist in the trace**.

`createOtelTrace().observation()` always passes the root's span context as
`parentSpanContext`, so a child cannot end up under anything else. The only way
to get that parent is a **second root span**, created by a second `createTrace()`
call during the same request, never ended, and therefore never exported —
leaving its one child orphaned. It shares the trace id because the second
`startObservation` inherited the ambient context of the first.

**This is pre-existing, not caused by the migration.** The legacy backend passes
`id: requestId` to `createTrace`, so two calls collapse onto one trace id and
look like a single trace. The OTel backend mints a fresh span per call, which
makes the duplication visible.

Fix this before flipping the default in Phase 4d. Ordering is not the cause: an
earlier attempt moved `trace.end?.()` after the buffer flush, which correctly
re-parented the other five children but left `response-summary` unchanged.

Start at `ensureTrace()` in
[telemetry-buffer.ts](../../../lib/server/telemetry/telemetry-buffer.ts), which
guards on `getRequestTrace(requestId)`. Either that guard is missed (a null
`requestId` on the first call), or the registry module is instantiated twice by
the bundler so the two call sites do not share it.

## Incidental finding: dead code

[chat-rag-utils.ts:63](../../../lib/server/chat-rag-utils.ts) exports
`processPreRetrieval`, which has **no callers anywhere in the repository**.
`rag-retrieval-chain.ts` imports only `enrichAndFilterDocs`,
`fetchRefinedMetadata`, `extractDocIdsFromBaseDocs`, and types from that module.

It matters here because it contains a **third** `withSpan({ name: "hyde" })`.
Anyone auditing hyde emission during Phase 4 will find three call sites and
have to work out that one is unreachable. Removing it is out of scope for the
migration but should happen before Phase 4 starts.
