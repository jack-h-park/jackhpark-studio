# Batched Load Prevention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent abandoned optional RAG work, duplicate within-run Notion fetches, and production calls from publisher unit tests while preserving the release hold.

**Architecture:** Use a child cancellation scope for optional retrieval, a bounded run-owned discovery cache, and a test-only inherited-environment guard. Keep independent commits and PR verification gates; do not combine their runtime state.

**Tech Stack:** Existing TypeScript, Node.js tests, LangChain/LangGraph, Notion client, Python/pytest; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-22-batched-load-prevention-design.md`

## Global Constraints

- Keep the existing 2,000ms optional-pass deadline, reduced to 1,200ms when multi-query shares the budget.
- Bound retained UTF-8 JSON snapshots to 8 MiB total, 32 entries, and 1 MiB per entry.
- No paid-tier changes, monitoring-cadence changes, merge, deployment, fleet install, or live-provider test calls.
- Strict TypeScript, no `any`, English documentation/comments, and existing telemetry contracts.
- Preserve the base answer, traversal caps, lifecycle accounting, and deletion/sweep completeness gates.

## Review Focus

1. Parent abort coincident with the optional deadline must remain a request abort, not a usable base fallback.
2. A provider that ignores abort may finish later; its completion must not start embedding, metadata, ranking, or cache writes.
3. Cache overflow or a discovery failure must fall back to fetching, not silently omit a document or authorize a deletion sweep.
4. Concurrent ingestion runs must never observe each other's snapshots or retain leftovers after failure.
5. Inherited credentials must be removed in child pytest processes while explicitly configured fake transport tests still exercise authorization behavior.

## Task 1: Make the Notion scalar boundary explicit

**Files:** Modify `pages/api/notion.ts`; retain `test/notion-api-cache.test.ts`.

**Interfaces:** Accept only a scalar string before `isSupportedNotionRoute`; success/error envelopes and CDN policy remain unchanged.

- [x] Run the route suite and record the existing failing CodeQL annotations on PR #240. Runtime tests are characterization evidence, not a newly failing unit test.
- [x] Add `typeof id !== "string"` to the early rejection condition before length checks and resolver use. Do not weaken validation or suppress CodeQL.
- [ ] Run `node --import tsx --test test/notion-api-cache.test.ts`, typecheck, and scoped lint. Push only when authorized as part of the draft PR workflow; verify the actual CodeQL gate rather than inferring it from local tests.
- [x] Commit the isolated boundary change.

## Task 2: Cancel optional retrieval without canceling the answer

**Files:** Create `lib/server/rag/optional-pass.ts`; modify `lib/server/api/chat-rag-context.ts`, `lib/server/langchain/rag-retrieval-chain.ts`, and `lib/server/rag-enhancements.ts`; create `test/rag-optional-pass-cancellation.test.ts` and `test/rag-retrieval-cancellation.test.ts`.

**Interfaces:**

- `runOptionalPass<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parentSignal?: AbortSignal | null): Promise<T>` owns its child controller/timer/listener and throws the existing `AutoPassTimeoutError` on its own deadline.
- Extend internal `RunRetrievalPass` with an optional third `AbortSignal` argument. Base retrieval uses the request signal; optional retrieval uses the child signal.
- Add optional `signal?: AbortSignal` to enhancement option types. Pass it to the existing model invocation and check cancellation before/after non-cancellable awaited operations.

- [x] Write failing behavioral tests: deadline aborts child but not parent; parent abort rejects immediately; already-aborted parent starts no work; success clears the timer; late rejection is observed.
- [x] Write a retrieval-boundary test where a blocked rewrite/embedding completes after cancellation. Assert that the next provider/database/metadata stage never starts and the orchestration retains the base result for optional timeout only. Mock external boundaries, not the cancellation helper or orchestration.
- [x] Run the focused tests and verify failures name missing cancellation, not import/setup errors.
- [x] Implement the child scope and pass its signal through the real retrieval graph. Re-throw aborts in enhancement catches and retain existing fallback for ordinary provider failures. Do not replace vector-search APIs or claim unsupported in-flight cancellation.
- [x] Run both focused suites and existing retrieval/ranking/telemetry tests; run the full Studio suite, typecheck, and lint. Verify coincident abort, no-auto strong-base, forced capability, and ordinary provider-error cases.
- [x] Obtain independent review and commit this deliverable separately.

## Task 3: Reuse bounded discovery snapshots inside ingestion

**Files:** Create `lib/admin/notion-run-cache.ts`; modify `lib/admin/manual-ingestor.ts`; create `test/notion-ingestion-fetch-reuse.test.ts`; extend `test/notion-discovery.test.ts` where needed.

**Interfaces:**

- `createNotionRunCache()` returns `remember(pageId: string, recordMap: ExtendedRecordMap): void`, `take(pageId: string): ExtendedRecordMap | undefined`, and `clear(): void` with the spec's fixed limits.
- Extend `collectLinkedPagesFromSeeds(seedPageIds, emit, options?)` with optional `options.onPage(pageId, recordMap): void`, invoked only after a successful nonempty page fetch. Existing callers need no changes.
- One run owns the cache. Workers call `take` before fetching and consume entries once; a surrounding `finally` clears leftovers.

- [x] Write failing tests for consume-once reuse, FIFO count eviction, UTF-8 byte/entry limits, invalid snapshots, and independent caches. Assertions observe returned maps/fetches, not private counters.
- [x] Exercise the real manual-ingestion path with external Notion/database/embedding boundaries controlled. For a discovered root and child, assert one `getPage` per reused page and unchanged ingested document identity. Assert a discovery failure and an uncached database-row leaf still fetch during processing.
- [x] Verify red failures, then implement bounded snapshots, the optional callback, and run-local lifecycle integration. Keep `markAttempt`, retries, deadline checks, and sweep authorization unchanged.
- [x] Test separate concurrent runs, oversized/evicted response fallback, processing failure cleanup, and incomplete traversal suppressing the sweep. An unchanged page must still use the existing content-hash skip.
- [x] Run focused suites and the full Studio suite, typecheck, lint, and fixture build. Obtain independent review and commit separately.

## Task 4: Fence publisher tests from production credentials

**Owner:** External publisher repository, separately isolated checkout. Preserve its unrelated work and follow its local AGENTS instructions before edits.

**Files in that repository:** Modify `tests/conftest.py`; create `tests/project_publisher/test_runtime_environment_isolation.py`; retain `tests/project_publisher/test_cli.py` and `tests/project_publisher/test_rag_refresh.py`.

**Interfaces:** Root autouse fixture `_publisher_runtime_credentials_never_reach_a_test(monkeypatch)` removes inherited `CRON_SECRET` and `RAG_INGEST_URL`. Production publisher modules and deployment scripts remain unchanged.

- [x] Add a parent/child pytest regression: the parent launches only the child probe with synthetic inherited credentials; the child intercepts all `urllib.request.urlopen` calls before invoking the real refresh function. Assert the child sees neither inherited variable and attempts zero HTTP requests. No real credentials or production network are permitted even on red.
- [x] Run the new test and confirm the existing fixture gap causes the failure.
- [x] Add the root autouse credential-removal fixture. Preserve explicit synthetic credentials set by transport tests after setup.
- [x] Run the isolation, CLI, and refresh suites, including existing fake-auth tests. Run the repository's documented full test command with machine credentials excluded; record every failure by name and distinguish baseline failures from regressions.
- [x] Obtain independent review and commit separately. Do not install the guard on the operations host or merge its PR without owner approval.

## Task 5: Verify the combined release candidate without releasing

- [x] Run the complete Studio test command, typecheck, lint, changed-file formatting, and `git diff --check` on the final combined tree.
- [x] Run `CI=true node scripts/ci/build-with-notion-fixture.mjs` with the pinned package-manager runtime; never publish the fixture build or crawl live Notion to validate this bundle.
- [x] Run the external repository's full suite safely and retain exact commands, outcomes, and unresolved failures.
- [ ] Run a whole-branch independent review. Record unsupported upstream cancellation and unmeasured production savings explicitly.
- [ ] Update draft PR evidence/follow-up checkboxes only for work actually implemented and verified. Keep merge/deployment holds in both repositories.
- [x] Before any documentation commit, run the portfolio watched-file check. Do not add a no-impact trailer without reading the corresponding live section.
- [ ] Preserve patches/commits and clean up only task-owned worktrees. If native tooling reports another owner, report the refusal and never bypass it with manual deletion.

## Local execution checkpoint — October 23, 2026

Tasks 1–4 have separate implementation commits and independent task reviews. Studio verification passed 713 unit tests plus two telemetry golden tests, typecheck, changed-file formatting, the fixture build, and full lint (six pre-existing warnings, no errors). The external test-only change passed 10,768 tests with 26 skips and no failures; existing warnings remain. Final whole-branch review and remote CodeQL verification remain separate gates. No merge, deployment, fleet installation, paid-tier change, monitoring-cadence change, or production-saving claim is authorized by this checkpoint.
