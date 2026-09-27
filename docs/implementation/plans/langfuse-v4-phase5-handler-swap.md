# Langfuse v4 — Phase 5 Design: LangChain Handler Swap

Companion to [langfuse-v4-migration-plan.md](langfuse-v4-migration-plan.md) and
[langfuse-v4-phase45-trace-consolidation.md](langfuse-v4-phase45-trace-consolidation.md).
Phase 4 is complete: the OTel backend is the only backend (#198).

This document exists because **the Phase 4/5 design doc's central claim about
Phase 5 does not survive checking**, and acting on it would have produced a
change that looks correct and achieves nothing.

## The claim that was wrong

The earlier design said:

> Phase 5 swaps `langfuse-langchain` for `@langfuse/langchain`. The v5 handler
> participates in the ambient OTel context instead of opening its own trace, so
> its spans nest under the Phase 4 root. Three traces collapse to one.

The first half is right: the v5 handler does take its parent from the ambient
OTel context, and owns no client of its own. The second half assumes our root
**is** the ambient span. It is not.

`createOtelTrace` builds the root with `startObservation`, which creates a span
without activating it in context. Activating it is what the sibling API
`startActiveObservation` is for, and we do not use it — children are parented
explicitly instead, via `parentSpanContext: root.otelSpan.spanContext()`.

Measured, not inferred:

```
활성 스팬 존재? false
root  traceId 371a1297bcbf80db707b39c9626202a4  spanId 49289c12e8b6fb15
span started with no explicit parent:
      traceId b23e99f02af782e029e10542058b73e9  parent (none)
```

A span started the way the v5 handler starts one lands in **a different trace
entirely**. Swapping the package by itself would therefore leave three traces
per request exactly as today, with the two satellite traces merely changing
from dashed-UUID ids to 32-hex ones. The visible outcome Phase 5 exists for —
one trace per request — would not happen, and nothing would fail to make that
obvious.

## What actually has to change

The root must be the active span while LangChain runs. Verified with the same
probe:

```ts
const ctx = otelTrace.setSpan(context.active(), root.otelSpan);
context.with(ctx, () => {
  /* LangChain invocation */
});
```

```
simulated-langgraph-node  same trace: true   parent == root
simulated-ChatOpenAI      same trace: true   parent == root
```

So Phase 5 is two changes, not one, and the package swap is the smaller of them.

### 1. Expose the root's context on the trace contract

`LangfuseTrace` must offer a way to run a function inside the root's context.
Prefer a method over leaking `otelSpan`, so the OTel dependency stays inside
`otel-trace-backend.ts` and the ~12 existing call sites keep seeing a
transport-agnostic interface:

```ts
/** Runs `fn` with the root observation as the active OTel span, so that
 *  instrumentation which parents itself from ambient context — the v5
 *  LangChain CallbackHandler — nests under this request instead of opening
 *  a trace of its own. */
runInContext: <T>(fn: () => T) => T;
```

### 2. Wrap the two invocation sites

Both already hold the trace:

- `runRagRetrieval` in [rag-retrieval-chain.ts](../../../lib/server/langchain/rag-retrieval-chain.ts) — wrap `graph.invoke(...)`
- the answer chain in [chat-stream-answer.ts](../../../lib/server/api/chat-stream-answer.ts) — wrap the chain call

Wrapping these two rather than the whole handler is deliberate. `context.with`
propagates into async work started inside it, but the chat handler's body spans
many awaits and several independent subsystems; scoping the activation to the
two places that need it keeps the blast radius to the spans in question.

## What the swap itself deletes

Once the handler no longer owns a client, most of
[langfuse-callbacks.ts](../../../lib/server/langchain/langfuse-callbacks.ts)
stops having a reason to exist:

| Today                                                   | After | Why                                                                       |
| ------------------------------------------------------- | ----- | ------------------------------------------------------------------------- |
| `baseUrl` / `publicKey` / `secretKey` passed explicitly | gone  | the v5 handler has no client; export is the `LangfuseSpanProcessor`'s job |
| `environment: trace.environment`                        | gone  | the processor already sets it from `getAppEnv()`                          |
| `metadata: { linkedTraceId }`                           | gone  | correlation by metadata is what one real trace replaces                   |
| `sessionId`                                             | keep  | still a first-class Langfuse attribute                                    |
| `tags`                                                  | keep  | same                                                                      |
| `handlersByTraceId` registry                            | gone  | nothing to drain per-trace                                                |
| `flushLinkedLangfuseCallbacks`                          | gone  | `flushLangfuseSpans()` already flushes the processor                      |
| `handler.langfuse.on("error", …)`                       | gone  | no client, so no error channel                                            |

The explicit host/key passing carried a trap worth recording as closed: the v3
handler reads `LANGFUSE_BASEURL` (no underscore) and otherwise defaults to the
EU host, while the rest of the app uses `LANGFUSE_BASE_URL` and the US host.
Relying on env autodiscovery shipped those spans to the wrong region, where
they 401ed silently. The v5 handler cannot reproduce this, because it does not
resolve a host at all.

Deleting `flushLinkedLangfuseCallbacks` also removes one of the two flush
paths in the deferred drain in
[langchain_chat_impl_heavy.ts](../../../lib/server/api/langchain_chat_impl_heavy.ts).
The ordering constraint documented there still holds for the rest: the buffer
flush emits `response-summary` through `trace.observation()`, so it must run
before `trace.end()`, which must run before the processor's `forceFlush`.

## Package changes

```
- langfuse-langchain  ^3.38.20
+ @langfuse/langchain ^5.11.1
```

Peers are already satisfied: `@langchain/core` 1.1.48 (needs `>=0.3.8`) and
`@opentelemetry/api` 1.9.0. Its own deps are `@langfuse/core` and
`@langfuse/tracing` at `^5.11.1`, while the repo pins `^5.10.1` for the other
`@langfuse/*` packages — bump all of them together so one copy of
`@langfuse/tracing` is resolved. Two copies would mean two tracer registries
and silently split traces, which is the same class of failure this phase is
trying to end.

## Open questions to settle during implementation

1. **Does the v5 handler reproduce the LangChain run hierarchy?** The probe
   above shows two sibling spans both inheriting the ambient root, because
   `startObservation` does not activate context. The real handler tracks
   `run_id` / `parent_run_id` and should nest `ChatOpenAI` under `answer:llm`
   rather than flattening both onto the root. Assert the parent chain in the
   golden rather than assuming it.
2. **Do LangGraph internals still export?** `__start__` and friends are
   LangChain-scope spans, not `langfuse-sdk` spans. No `shouldExportSpan`
   filter is configured on the processor today, so they should pass — confirm
   rather than assume, because adding one later would silently drop them.
3. **Does `hyde` still nest correctly?** It is emitted twice on purpose: the
   LangGraph node wraps the stage, and `maybeSpan` inside the stage wraps the
   generation. Once both are in one tree the inner one should become a child of
   the outer. That is an improvement, but it is also the clearest signal that
   parenting works — check it explicitly.
4. **`answer:llm` vs `answer:summary`.** Already renamed in #114 precisely so
   this merge would not collide. Confirm both survive in one tree.

## Rollout

Preview deployments are skipped repo-wide by `vercel.json`'s `ignoreCommand`,
so the preview soak used for Phases 3–4d1 is not available, and #198 gave up
the environment-variable rollback. Two consequences:

- **Carry a flag**, the way 4a did — select the v3 or v5 handler at runtime so
  reverting is an environment variable rather than a revert commit. This is the
  compensation for having no soak.
- **Lean on the golden.** The byte-identical comparison between two backends is
  the only equivalence evidence that has actually worked on this project. Snapshot
  the tree before and after; the diff is expected here (three traces become one),
  so the assertion is on the resulting parent chain, not on equality.

Production traffic is not a substitute for either: in the 24 hours after #198
merged, the only chats on the site were the three verification probes. Waiting
for organic traffic to build confidence does not work at this volume.

## Sequencing

1. Add `runInContext` to the trace contract and wrap the two invocation sites.
   **This has no production-visible effect on its own** — the v3 handler is
   pre-OTel and takes nothing from ambient context, and our own spans already
   pass an explicit parent, so nothing in a trace moves. Its verification is a
   unit test asserting that a span started with no explicit parent inside
   `runInContext` lands under the root. Ship it separately anyway: it is the
   piece the earlier design missed, and reviewing it next to the swap would
   bury it.
2. Swap the package behind the flag, delete the correlation machinery, update
   the golden. This is where the tree changes, and where the flag earns its
   keep.
3. Flip the default, then remove the flag and the v3 dependency.

Note the asymmetry with Phase 4: there, step 1 (add the backend behind a flag)
was independently verifiable because both backends could be driven through the
same scenario and diffed. Here the two steps are not independently observable,
because the mechanism under test only activates once the new handler is in
place. Do not read step 1 passing as evidence that step 2 will work.
