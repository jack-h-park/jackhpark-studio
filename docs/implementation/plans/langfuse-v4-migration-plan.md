# Langfuse v4 Migration Plan

## Purpose

Langfuse Cloud becomes v4-only on **2026-11-16**. After that date the legacy
`/api/public/ingestion` trace and observation events, and the legacy read
endpoints this repository depends on, are removed.

This repository does not use the Langfuse SDK's tracing API. It hand-assembles
`trace-create` / `span-create` ingestion events and posts them through
`client.api.ingestion.batch()`. That transport is exactly what v4 removes, so
the migration is a rewrite of the telemetry transport layer rather than a
dependency bump.

This document records the plan and its status. It does not authorize production
configuration changes or deployment by itself.

## Verified Starting State

Checked against the live project on 2026-08-25:

| Fact                    | Value                                                                               | Source                                                    |
| ----------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Langfuse server version | `4.19.0`                                                                            | `getHealth`                                               |
| Observations API v2     | Responds, cursor pagination works                                                   | `listObservations` on project `cmi0opra1032lad07bxq2iaar` |
| Legacy ingestion        | Still accepted until 2026-11-16                                                     | Langfuse deprecation notice                               |
| `@langfuse/client`      | `^4.4.2` (v4) — needs `>=5.4.0`                                                     | `package.json`                                            |
| `langfuse-langchain`    | `^3.38.20` (v3 SDK) — package replaced by `@langfuse/langchain` 5.x                 | `package.json`                                            |
| OpenTelemetry bootstrap | **None.** `@opentelemetry/api` and `sdk-trace-node` are declared but unused         | repo grep                                                 |
| `instrumentation.ts`    | Exists, but is a debug stub that **returns early when `NODE_ENV === "production"`** | file read                                                 |

The server side is already v4, so migration work can begin immediately and can
land incrementally. There is no need for a big-bang cutover.

### Legacy shim artifact visible today

Trace `01a037ad-9a94-763e-b8f0-fb228a516204` currently renders as:

```
answer:root   (id: t-01a037ad-…)  isRootObservation: true, parent: null
└─ answer:root   (id: 01a037ad-…)
   ├─ answer:prompt
   └─ answer:llm
      └─ ChatOpenAI  (GENERATION)
```

`answer:root` appears twice. The v4 server synthesizes a root observation
`t-<traceId>` from the legacy trace record and nests the real root span beneath
it. This duplication disappears once spans are exported over OTLP.

### Trace topology is fragmented (measured 2026-08-26)

A single chat request on the preview deployment produced **three separate
traces**:

| Trace             | Observations                                                                       |
| ----------------- | ---------------------------------------------------------------------------------- |
| `01a03cc3-c69b-…` | `rewrite`, `hyde`, `retrieve`, `rerank`, `context`                                 |
| `ac448088-eefa-…` | `hyde`, `context:selection`, `answer:llm`, `answer:stream`, `response-summary`     |
| `01a03cc3-d42a-…` | `answer:root` (+ synthetic `t-` root), `answer:prompt`, `answer:llm`, `ChatOpenAI` |

Spans named `hyde` and `answer:llm` each appear in two of the three traces under
different observation IDs. Whether those represent the same work emitted twice
or genuinely distinct stages has to be established before Phase 4 — the answer
decides whether merging traces deduplicates them or silently drops one.

No single trace holds the whole request, so no single trace can carry a complete
root observation. Consolidating these into one OTel trace is the concrete goal
of Phase 5, and it is what makes the v4 root-observation model workable here.

(An earlier revision of this plan recorded that `answer:llm` and `answer:root`
shared one trace ID. That reading came from a partial listing; the table above
supersedes it.)

## Blocking Defect Found During Planning

`getAppEnv()` ([lib/langfuse.node.ts](../../../lib/langfuse.node.ts)) resolves
the environment tag as `APP_ENV ?? NODE_ENV`. `APP_ENV` is **not set in any
Vercel scope**, and Vercel sets `NODE_ENV=production` for Preview builds as well
as Production builds.

Consequence: **Preview deployments emit Langfuse traces tagged
`environment: "prod"`.** The same fallback chain drives
`DEFAULT_LANGFUSE_ENV_TAG` in
[lib/server/settings/langfuse-settings.ts](../../../lib/server/settings/langfuse-settings.ts).

This makes Preview unusable as a telemetry test bed — migration test traffic
would land in the production environment view and in the weekly digest. It must
be fixed before any other phase.

`VERCEL_ENV` is the correct signal and is already used elsewhere in this
repository (`lib/dev/devFlags.ts`, `pages/robots.txt.tsx`,
`pages/api/internal/chat/history-preview.ts`).

## Phases

Ordered by ascending risk. Each phase is independently shippable.

### Phase 0 — Environment separation (config + one function)

**Risk: minimal.** Production behavior is unchanged; only Preview changes.

- Derive the app environment from `VERCEL_ENV` when `APP_ENV` is absent.
- Keep `APP_ENV` as an explicit override that still wins.
- Verify: Production stays `prod`, Preview becomes `preview`, local stays `dev`.

### Phase 1 — Preview deployment enablement

**Risk: minimal.** No application code.

Preview already has nearly all required environment variables (`LANGFUSE_*`,
`SUPABASE_*`, `OPENAI_API_KEY`, `TELEMETRY_*`). The gap is operational: Preview
has never been used, so no deployment has been exercised or verified.

- Open a branch PR to produce a Preview deployment.
- Verify the Preview URL serves chat and that traces arrive under
  `environment=preview`.
- Record the workflow in `docs/operations/`.
- Confirm `POSTHOG_PERSONAL_API_KEY` remains absent from Preview.

**Status.** PR #108 produced a Preview deployment. Two findings:

1. Preview deployments are served behind **Vercel Deployment Protection (SSO)** —
   an unauthenticated request 302s to `vercel.com/sso-api`. Preview URLs cannot
   be curled or shared without either signing in or enabling _Protection Bypass
   for Automation_ (`x-vercel-protection-bypass` header). Enabling the bypass is
   a prerequisite for scripted verification in Phases 3–5.
2. Langfuse held **zero observations under `environment=preview`** for the month
   preceding the fix, despite several preview deployments in that window —
   confirming the Phase 0 defect empirically.

**Verified 2026-08-26.** A chat request against `/studio` on the preview
deployment produced 15 observations, **all tagged `environment: "preview"`** —
the full pipeline (`rewrite` → `hyde` → `retrieve` → `rerank` → `context` →
`answer:prompt` → `answer:llm` → `ChatOpenAI` → `answer:stream` →
`response-summary`). Preview is now a usable telemetry test bed.

Preview telemetry env matches production exactly (`TELEMETRY_ENABLED=true`,
`TELEMETRY_SAMPLE_RATE_MAX=1`, `TELEMETRY_DETAIL_MAX=standard`), and neither
`TELEMETRY_SAMPLE_RATE_OVERRIDE` nor `TELEMETRY_DETAIL_OVERRIDE` exists in any
scope — so the Phase 0 change that lets overrides apply outside production has
nothing to act on today. Worth re-checking if either variable is ever added.

Operational note: observations took roughly 8 minutes to become queryable. Do
not treat a fast empty query as a dropped trace.

### Phase 2 — Read-endpoint migration (scripts only)

**Risk: low.** Analysis scripts only; no application runtime, no ingestion.

[scripts/telemetry/weekly-digest.ts](../../../scripts/telemetry/weekly-digest.ts):

- `/api/public/v2/scores` → `/api/public/v3/scores`
  - `page` → `cursor` pagination
  - single typed `value` field; no `value` / `stringValue` split
  - `traceId` and `comment` require `fields=details,subject`
  - `toTimestamp` becomes exclusive — re-check weekly boundaries
- `/api/public/metrics` → `/api/public/v2/metrics`
  - `view: "traces"` is removed; use `view: "observations"` with filter
    `isRootObservation = true` for trace counts
  - `observations` view measures are unchanged

**Verified against the live project** over 2026-08-18..25 before and after:
traces 21 = 21, `sum_totalCost` and `p95_latency` byte-identical, scores 19 = 19.
Observation count steps 119 → 140 because v4 synthesizes a `t-<traceId>` root
observation per legacy-ingested trace; expect that gap to close after Phase 4.

**Breaking difference found:** v3 returns one `value` typed by `dataType`, so
BOOLEAN scores (`user_feedback`) arrive as `true`/`false` where v2 sent `1`/`0`.
`digest.ts` compares `value === 1`, which a boolean fails under JS strict
equality — all ratings would flip to 👎 and the proxy/human correlation sample
would drop to zero. Normalized in the fetch layer so `digest.ts` is unchanged.

`scripts/telemetry/sync-analytics.ts` uses `/api/public/score-configs` and
`lib/server/notifications/telegram.ts` uses `/api/public/projects`. Neither is
deprecated. **No change required.**

### Phase 3 — OpenTelemetry bootstrap

**Risk: medium.** Additive; can coexist with legacy ingestion.

> Full design: [langfuse-v4-phase3-otel-bootstrap.md](langfuse-v4-phase3-otel-bootstrap.md)

- Add `@langfuse/tracing`, `@langfuse/otel`, bump `@langfuse/client` to 5.x.
- Rewrite [instrumentation.ts](../../../instrumentation.ts) to register
  `LangfuseSpanProcessor`. **It currently returns early when
  `NODE_ENV === "production"`**, which on Vercel covers both Preview and
  Production. Registering OTel inside that stub without removing the guard would
  silently produce no traces in exactly the environments being migrated.
  `build:instrumentation` in `package.json` bundles this file with esbuild —
  verify that path still works after the rewrite.
- Resolve the serverless flush contract: `waitUntil(processor.forceFlush())`.
  This is the highest-risk detail in the whole migration — see the incident
  history behind the flush comment in `langfuse-callbacks.ts`.
- Audit `shouldExportSpan`. v5 filters non-LLM spans by default, which would
  silently drop custom spans such as `rag:retrieval`. Compose with
  `isDefaultExportSpan` if needed.
- Validate on Preview before any production exposure.

### Phase 4 — Ingestion rewrite

**Risk: high.** This is the breaking change.

- Reimplement `lib/langfuse.node.ts` internals over OTLP while preserving the
  `LangfuseTrace` and `withSpan` public signatures, so the ~12 call sites stay
  untouched.
- Replace the accumulate-and-resend `trace.update()` pattern (11 call sites)
  with in-memory accumulation and a single export on span end. Re-ingesting the
  same ID to update it is explicitly disallowed in v4.
- Move trace-level `input` / `output` to the **root observation**. v4 has no
  trace-level input/output; leaving them where they are means losing them.
- Replace the `environment` / `release` attributes with
  `LANGFUSE_TRACING_ENVIRONMENT` / `LANGFUSE_RELEASE`.
- Serialize metadata to `Record<string, string>`, values ≤200 characters.
- Rewrite `emitAnswerSummarySpan` to use `startObservation`.
- Rewrite the `TELEMETRY_TEST_SINK` harness against an in-memory OTel exporter
  and refresh the telemetry golden snapshots.

### Phase 5 — LangChain handler replacement

**Risk: high.** Depends on Phase 3 and 4.

- `langfuse-langchain` → `@langfuse/langchain`.
- `handler.langfuse.on("error", …)` and `handler.flushAsync()` no longer exist;
  flushing consolidates into the span processor.
- The `LANGFUSE_BASEURL` / EU-region trap and its explicit host/key workaround
  become unnecessary.
- Decide whether to merge the LangChain spans into the primary trace via shared
  OTel context, removing the `linkedTraceId` correlation.

### Phase 6 — Documentation and verification

- Update `docs/telemetry/setup.md`, `docs/telemetry/langfuse-guide.md`, and the
  trace-topology section of the architecture doc.
- Confirm the weekly digest produces comparable numbers across the cutover.

## Score Writes Are Not Affected

Langfuse explicitly commits to keeping `score-create` events on
`POST /ingestion` after the v4 cutover. `lib/server/telemetry/langfuse-scores.ts`
and the feedback API path need **no migration**.

## Status

| Phase                      | Status                         |
| -------------------------- | ------------------------------ |
| 0 — Environment separation | **Done** — merged in #108      |
| 1 — Preview enablement     | **Done** — verified 2026-08-26 |
| 2 — Read endpoints         | **Done** — merged in #108      |
| 3 — OTel bootstrap         | Designed, not implemented      |
| 4 — Ingestion rewrite      | Not started                    |
| 5 — LangChain handler      | Not started                    |
| 6 — Docs and verification  | Not started                    |
