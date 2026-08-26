# Langfuse v4 — Phase 3 Design: OpenTelemetry Bootstrap

Companion to [langfuse-v4-migration-plan.md](langfuse-v4-migration-plan.md).
This document specifies Phase 3 only: standing up an OpenTelemetry pipeline that
exports to Langfuse. It changes no existing telemetry behavior.

## Goal and non-goals

**Goal.** Register a `LangfuseSpanProcessor` so that spans created with
`@langfuse/tracing` reach Langfuse over OTLP, and prove the flush contract holds
on Vercel before any real telemetry depends on it.

**Non-goals.** Phase 3 does not rewrite `lib/langfuse.node.ts`, does not touch
the LangChain handler, and does not remove any legacy ingestion. After Phase 3
the app still emits exactly the traces it emits today, through the legacy path.
The only new thing in Langfuse is one deliberate validation span.

This separation is the point: the risky part of the migration is the flush
contract on a frozen serverless instance, and this phase isolates it.

## Why this phase is where the risk is

`lib/server/langchain/langfuse-callbacks.ts` carries an incident record: the
answer-stage handler's queue was drained by a background timer, Vercel froze the
instance when the response ended, and `answer:root` — the only record of real
token usage and cost — was lost on 5 of 6 production chats. `waitUntil` was
added to fix it.

An OTel `BatchSpanProcessor` has the same shape of failure. Phase 3 must
therefore establish and verify the flush path _before_ Phase 4 moves real
telemetry onto it.

## Package changes

```
+ @langfuse/tracing      ^5
+ @langfuse/otel         ^5
+ @opentelemetry/sdk-node
  @langfuse/client       ^4.4.2  ->  ^5
- (none removed in this phase; langfuse-langchain stays until Phase 5)
```

Two existing declarations need attention:

- `@opentelemetry/api ^1.9.0` and `@opentelemetry/sdk-trace-node ^1.29.0` are in
  `package.json` but **unused anywhere in the source**. `@opentelemetry/sdk-node`
  pulls its own compatible versions; confirm whether these two should stay as
  explicit peers or be dropped.
- `engines.node` is `>=18`, but `@langfuse/otel` requires **Node ≥ 20**. CI
  already runs Node 20 and 22 and Vercel runs 20+, so `>=18` is stale rather
  than load-bearing. Raise it to `>=20`.

### `@langfuse/client` v4 → v5

The repo uses only `client.api.ingestion.batch()` and `client.score.*`. The v5
breaking change is the `api.*` namespace remap (`observationsV2` →
`observations`, legacy v1 moved under `api.legacy.*`). Neither surface is used
here, so the bump should be inert — but verify `client.score.create()` and
`client.score.flush()` still exist under those names, since
`lib/server/telemetry/langfuse-scores.ts` and the feedback API depend on them.

Score writes stay on `POST /ingestion`; Langfuse commits to supporting
`score-create` events past the v4 cutover. No score migration is needed.

## `instrumentation.ts`

The current file is a debug stub:

```ts
export function register() {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  console.log("[langchain_chat_impl] instrumentation registered");
}
```

**The early return is the trap.** On Vercel, `NODE_ENV` is `production` for both
Preview and Production, so registering OTel inside this guard would produce no
traces in exactly the two environments being migrated — and would do so silently.
The guard must go.

Proposed shape:

```ts
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

// Exported so request handlers can force a flush before the serverless
// instance is frozen. See "Flush contract" below.
export const langfuseSpanProcessor = new LangfuseSpanProcessor();

export function register() {
  // Next.js also runs this module on the edge runtime, where NodeSDK cannot
  // load. pages/api/social-image.tsx is the only edge route today.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  new NodeSDK({ spanProcessors: [langfuseSpanProcessor] }).start();
}
```

Open items to settle during implementation:

- **Module-scope construction.** The processor must be constructed at module
  scope to be importable by handlers, while `sdk.start()` belongs in
  `register()`. Confirm that constructing `LangfuseSpanProcessor` on the edge
  runtime (where the module is still evaluated) does not throw. If it does, move
  it behind a lazy getter.
- **`build:instrumentation`.** `package.json` has
  `esbuild instrumentation.ts --platform=node --format=esm --outfile=instrumentation.js`,
  but no `instrumentation.js` is committed or referenced. Determine whether this
  script is dead and remove it, or keep it working. A stray bundled
  `instrumentation.js` at the repo root could shadow the `.ts` file.
- **Next.js's own spans.** Registering a global tracer provider makes Next.js
  emit its own spans. The v5 default filter drops them (not `langfuse-sdk`, not
  `gen_ai.*`), which is the desired outcome — but confirm on preview rather than
  assuming.

`NodeSDK` is constructed without an `instrumentations` array, so nothing is
auto-instrumented. No HTTP, DB, or framework spans are created.

## Flush contract — deviates from the Langfuse docs

Langfuse documents the Vercel pattern as `after()` from `next/server`:

```ts
after(async () => {
  await langfuseSpanProcessor.forceFlush();
});
```

**This does not apply to this repository.** `after()` is an App Router utility
(route handlers, server components, server actions, middleware). The chat
endpoints are Pages Router — `pages/api/chat.ts` and
`pages/api/langchain_chat.ts` — where `after()` is unavailable.

The repo already solved this with `waitUntil` from `@vercel/functions`, which
works in Pages Router API routes and no-ops off-Vercel. The Langfuse flush
should join the existing sink drain in
[lib/server/api/langchain_chat_impl_heavy.ts](../../../lib/server/api/langchain_chat_impl_heavy.ts)
rather than introduce a second mechanism:

```ts
const flushed = new Promise<void>((resolve) => {
  setImmediate(() => {
    void Promise.allSettled([
      telemetryBuffer?.flush().catch(/* ... */),
      flushPostHog(),
      flushLinkedLangfuseCallbacks(traceState.trace?.traceId),
      langfuseSpanProcessor.forceFlush(), // <- added in Phase 3
    ]).finally(resolve);
  });
});
waitUntil(flushed);
```

That block is already registered on both `res.once("finish")` and
`res.once("close")` and is idempotent via `telemetryScheduled`, so streaming and
aborted requests are covered by the existing wiring.

Note the App Router routes under `app/api/internal/rag/` are a separate case. They
are cron-driven and do not currently emit Langfuse traces; if that changes, they
can use `after()` normally.

## Span filtering

v5 exports a span only if it is a Langfuse SDK span, carries `gen_ai.*`
attributes, or comes from a known LLM instrumentation scope. Everything else is
dropped by default.

Spans created through `@langfuse/tracing` are Langfuse SDK spans, so the app's
own observations (`retrieve`, `rerank`, `answer:llm`, …) pass the default filter
once Phase 4 creates them that way.

**Start with the default filter.** Do not pre-emptively pass
`shouldExportSpan: () => true` — that reinstates the pre-v5 noise the filter
exists to remove. If spans go missing during Phase 4, debug with
`LANGFUSE_DEBUG=true` and compose rather than replace:

```ts
import { isDefaultExportSpan, type ShouldExportSpan } from "@langfuse/otel";

const shouldExportSpan: ShouldExportSpan = ({ otelSpan }) =>
  isDefaultExportSpan(otelSpan) || /* narrow, justified addition */ false;
```

`@langfuse/otel` also exports `isLangfuseSpan`, `isGenAISpan`,
`isKnownLLMInstrumentor`, and `KNOWN_LLM_INSTRUMENTATION_SCOPE_PREFIXES`.

Filtering can orphan observations when a parent is dropped and its children are
not — relevant here because the request already fans out across three traces
(see the migration plan).

## Environment tagging

v5 removes the `environment` and `release` span attributes. They come from
`LANGFUSE_TRACING_ENVIRONMENT` and `LANGFUSE_RELEASE` instead.

This interacts with the Phase 0 fix. `getAppEnv()` derives the environment at
runtime from `VERCEL_ENV`; v5 wants a static env var. Vercel's per-scope
variables cover this directly:

| Scope                      | `LANGFUSE_TRACING_ENVIRONMENT` |
| -------------------------- | ------------------------------ |
| Production                 | `prod`                         |
| Preview                    | `preview`                      |
| Development / `.env.local` | `dev`                          |

Set these to exactly the strings `getAppEnv()` returns, so v4 traces land in the
same environment buckets as the legacy ones and dashboards stay continuous
across the cutover.

`getAppEnv()` itself stays — `lib/logging/config.ts` and
`lib/server/settings/langfuse-settings.ts` still use it.

Verify during implementation whether `LangfuseSpanProcessor` accepts an
`environment` constructor option; if it does, deriving it from `getAppEnv()`
removes the need to keep three env-var values in sync with one function.

## Validation on preview

Phase 3 emits no real telemetry, so it needs a deliberate probe.

1. Add one temporary span behind an explicit debug flag — for example extend
   `pages/api/_debug/runtime.ts`, which is already secret-gated with
   `DEBUG_API_SECRET` and returns 404 otherwise.
2. Deploy to preview via PR.
3. Hit the probe, then confirm in Langfuse that the span arrives with
   `environment=preview`.
4. **Allow ~8–10 minutes.** Langfuse ingestion lag was measured at ~8 minutes
   during Phase 1. An empty query before then proves nothing.
5. Remove the probe before merge, or keep it permanently secret-gated.

Preview access requires either a browser sign-in or _Protection Bypass for
Automation_ — preview deployments 302 to `vercel.com/sso-api` for
unauthenticated requests. The bypass is worth enabling for Phases 4 and 5, where
verification loops get much tighter.

## Exit criteria

Phase 3 is done when all of the following hold:

- [ ] A span created via `@langfuse/tracing` appears in Langfuse from a preview
      deployment, tagged `environment=preview`.
- [ ] It survives a streaming chat response — i.e. it is flushed through
      `waitUntil`, not by luck of timing.
- [ ] The existing legacy traces are unchanged: a preview chat still produces the
      same observations it produced before Phase 3.
- [ ] `pnpm test`, `pnpm test:telemetry-golden`, `pnpm typecheck`, and ESLint on
      changed files all pass.
- [ ] Production is deployed and a production chat still produces its normal
      trace, confirming the added `forceFlush()` did not disturb the existing
      sink drain.

The last item matters more than it looks: Phase 3 modifies a code path that
every chat request runs, even though it adds no telemetry of its own.

## Rollback

Phase 3 is additive and reverts cleanly. If preview shows problems, revert the
`instrumentation.ts` rewrite and the one-line `forceFlush()` addition; the legacy
ingestion path is untouched and keeps working until 2026-11-16.
