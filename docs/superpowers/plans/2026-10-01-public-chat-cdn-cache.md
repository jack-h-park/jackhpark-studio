# Public Chat CDN Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce anonymous `/chat` CPU and backend reads without adding an ISR route or exposing administrator configuration.

**Architecture:** Keep Pages Router SSR, narrow its props to an explicit public contract, and cache successful anonymous HTML/data responses with empty query in the Vercel CDN for 900 seconds. Query-bearing responses remain private and untagged because Next independently serializes query values in framework HTML. Load only the root block for navigation. Tag only chat-shell responses and invalidate that tag after a successful configuration save; do not purge the project or image cache.

**Tech Stack:** Next.js 15 Pages Router, React 19, strict TypeScript, existing Supabase settings loader, existing `@vercel/functions`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-20-vercel-usage-recovery-design.md`, section 4. This plan delivers that deferred phase, not a redesign of the conversation API or settings ownership.

## Global Constraints

- Public Notion pages use a 60-minute normal ISR interval.
- Production Preview deployments remain suppressed.
- Do not publish private chat configuration, system prompts, telemetry configuration, or server-only provider policy.
- The chat conversation API, authenticated admin pages, and any response containing user-specific content remain uncacheable.
- Do not alter RAG retrieval, chat-answer caching, or the administrator's current model configuration policy.
- Use no new dependencies, schema changes, production configuration writes, or paid chat probes.
- Preserve session-only user overrides and server-authoritative preset enforcement.
- Repository documentation and comments are English; new code uses no `any` or ad-hoc logging.

## Review Focus

1. New or nested administrator fields must never leak through object spreads in the public projection; pin exact key sets in Task 1.
2. Removing preset prompts from the browser must not remove them from server-side prompt composition or copy them into the user's editable prompt; pin both in Task 1.
3. HTML and `/_next/data` responses must share the chat-only tag and must not cache session-specific data; pin both in Task 3.
4. A committed settings save followed by purge failure must not be reported as an unsaved setting; test partial success in Task 3.
5. A failed/missing root-block read must remain retryable, not become a 15-minute cached broken header; test failure recovery in Tasks 2 and 3.

## Evidence and Work Boundaries

- On October 1, 2026, the user reported a new email stating the free team's ISR Writes had reached 200,000. This is user-supplied evidence, not a freshly retrieved dashboard total or a daily-rate measurement.
- Live checks on October 1 confirmed production `0165251` is Ready, `/studio` is 200/HIT, `/chat` is 200/MISS with private/no-store, and `/xmlrpc.php` still returns 200. PR #215 is OPEN, unmerged, with successful checks. Do not merge it without explicit authorization.
- `/studio` public props contained an 892,871-byte uncompressed record map, zero `signed_urls` entries, and zero `X-Amz-Signature` occurrences. This is not a compressed ISR write-unit measurement and does not prove unchanged output across regenerations.
- ISR Writes are measured in 8KB units. Current Vercel documentation says unchanged regeneration output does not incur write units. A changing output payload is therefore a separate diagnostic target from regeneration frequency.
- `/chat` currently passes `AdminChatConfig` to its client provider. Both root and per-preset prompts are present in that type. The navigation loader currently calls the fully hydrated `getPage` before trimming it.
- Keep ISR-output stability, public-page registry enforcement, monitor deduplication, and ingestion-input validation as separate follow-on changes. Do not silently expand this PR to remote scheduler changes or remove production coverage.

## File Responsibilities

- `types/public-chat-config.ts`: explicit browser-only config and runtime types.
- `lib/server/public-chat-config.ts`: field-by-field projection; no persistence.
- `components/chat/context/ChatConfigContext.tsx`, `components/chat/ChatFullPage.tsx`, and existing settings consumers: accept public types without UI/ownership redesign.
- `lib/server/notion-header.ts`: root-only fetch, trimmed map, bounded module cache, single-flight, failure recovery.
- `lib/server/public-chat-page.ts`: testable SSR props/response-policy factory wired by `pages/chat.tsx`.
- `lib/server/public-chat-cache.ts`: tag and TTL constants, environment-aware invalidation result.
- `pages/api/admin/chat-config.ts`: persistence followed by chat-only invalidation and explicit partial success.
- New tests: `test/public-chat-config.test.ts`, `test/notion-navigation-header-budget.test.ts`, `test/public-chat-page.test.ts`, `test/public-chat-cache-save.test.ts`.
- New runbook: `docs/operations/public-chat-cdn-cache.md` with rollout proof and rollback.

### Task 1: Define and Integrate the Public Chat Contract

**Files:** Create public type/projection/test files above. Modify `pages/chat.tsx`, `ChatFullPage`, `ChatConfigContext`, `settings/preset-overrides.ts`, `settings/effective-settings.ts`, `SettingsSectionPresets`, `SettingsSectionModelEngine`, `SettingsSectionRagRetrieval`, `SettingsSectionContextHistory`, `SettingsSectionOptionalOverrides`, `AdvancedSettingsPresetEffects`, and `ChatAdvancedSettingsDrawer` only where their config types/default-prompt initialization require it.

**Interfaces:** `toPublicChatConfig(config: AdminChatConfig): PublicChatConfig`; `toPublicChatRuntimeMeta(meta: AdminChatRuntimeMeta): PublicChatRuntimeMeta`. Server/admin consumers retain full administrator types.

- [x] Write failing projection tests with sentinel secrets and unknown fields at root and nested levels. Assert exact public root keys: `baseSystemPromptSummary`, `numericLimits`, `allowlist`, `summaryPresets`, `presets`. The summary is existing public UI copy, not the actual prompt.
- [x] Pin every nested key. Public presets include only `llmModel`, `embeddingModel`, `rag`, `context`, `features`, `summaryLevel`, `safeMode`, `showTelemetry`, `showCitations`. Exclude `additionalSystemPrompt`, `requireLocal`, `reasoningEffort`, root prompts, guardrail text, ranking, generation, cache, telemetry configuration, and unknown future fields. Public runtime metadata includes only model-resolution/availability fields already read by browser components; exclude `localLlmBackendEnv`.
- [x] Run `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/public-chat-config.test.ts`; expect assertion failure before implementation, not a network request.
- [x] Implement explicit projections, including nested objects and model-resolution entries. Do not use administrator object spreads, `Omit<AdminChatConfig, ...>`, or casts that manufacture a full admin config on the client.
- [x] Update client types and preset initialization. A newly applied preset starts with an empty user `additionalSystemPrompt`; server-side `buildFinalSystemPrompt` continues to compose private base/preset prompts plus the user's override. Keep public model choices, preset display, numeric clamping, summary controls, and custom overrides unchanged.
- [x] Test selecting/resetting all four presets, preserving a genuine user prompt, and server composition containing private base/preset prompts once. Assert serialized page props contain no sentinel secrets. Run focused tests and `pnpm typecheck`; expect pass.
- [x] Commit only the named contract/consumer/tests files with `feat: separate public chat configuration from admin settings`.

### Task 2: Bound Navigation-Header Work

**Files:** Modify `lib/server/notion-header.ts`; create `test/notion-navigation-header-budget.test.ts`. Read `lib/notion-api.ts`, `lib/notion-rate-limit.ts`, and `lib/server/settings/ttl-cache.ts` for existing client/retry/cache conventions.

**Interfaces:** Preserve `loadNotionNavigationHeader(): Promise<NotionNavigationHeader>` for existing callers. Export a dependency-injected `createNotionNavigationHeaderLoader` test factory with `fetchRoot(pageId: string): Promise<ExtendedRecordMap>` and `now(): number` dependencies.

- [x] Write failing fake-client tests: repeated/concurrent reads within 3,600,000ms make one upstream request; reads do not slide expiry; expiration makes one new request; rejected reads recover on the next call; missing root blocks are not cached. No live Notion request in tests.
- [x] Pin default fetch options `chunkLimit: 1`, `fetchCollections: false`, `fetchMissingBlocks: false`, `fetchRelationPages: false`, `signFileUrls: false` on the existing Notion client. Assert no call to full `getPage`, collection hydration, relation expansion, tweet processing, or preview-image processing.
- [x] Run the new focused test with the command pattern from Task 1; verify red assertions, then implement root-only fetch with existing rate-limit retry, fixed-deadline cache, and single-flight. Preserve root-ID normalization and record-value unwrapping.
- [x] Keep only normalized root block entries; emit empty collection/query/view/user/signed-URL maps. Preserve null-header fallback on failure without caching the failure or adding logs outside repository conventions.
- [x] Run focused tests plus `pnpm typecheck`; expect pass. Verify admin callers retain navigation chrome and require no authentication/persistence changes.
- [x] Commit named header/tests files with `perf: bound Notion navigation header reads`.

### Task 3: Cache Only the Anonymous Chat Shell and Invalidate After Save

**Files:** Create public-page/cache/test modules; modify `pages/chat.tsx`, `pages/api/admin/chat-config.ts`, and the existing save-result notification in `pages/admin/chat-config.tsx`. Keep `/api/chat`, `/api/chat-runtime`, and `/api/chat-config` outside this cache policy.

**Interfaces:** `PUBLIC_CHAT_CACHE_TAG = "public-chat-shell-v1"`; `PUBLIC_CHAT_CDN_TTL_SECONDS = 900`; `PUBLIC_CHAT_SWR_SECONDS = 60`. `invalidatePublicChatShell(): Promise<"invalidated" | "skipped-local">`. A injected SSR factory returns `GetServerSideProps` with public props, loads a fresh config on a CDN miss, and consumes Task 1's projections and Task 2's header loader.

- [x] Write failing tests: successful anonymous response sends `Cache-Control: public, max-age=0, s-maxage=900, stale-while-revalidate=60` and `Vercel-Cache-Tag: public-chat-shell-v1`; personalized/authorization/draft responses and missing-header/error responses send private/no-store and no tag. No `getStaticProps`, `revalidate` value, or session data appears in the public shell.
- [x] Test both HTML and Next data request contexts and cookies carrying arbitrary sentinel values. The public loader must not consult cookies, load a user/admin session, or serialize request input into projected props. Cookie presence alone is not personalization; the shell must be identical. Any query key must bypass shared caching: Next can serialize query values in private framework HTML despite safe props. Any future session-dependent branch must bypass cache before reading its session.
- [x] Run the new focused tests; expect red assertions. Implement SSR factory and wire it to `pages/chat.tsx`. On an actual CDN miss, retain fresh settings reads rather than relying on the indefinitely cached admin loader; CDN hits, not stale settings, are the primary CPU saving.
- [x] Implement production invalidation via existing `invalidateByTag(PUBLIC_CHAT_CACHE_TAG)` from `@vercel/functions`; do not add a bearer token or project-wide purge. Local mode explicitly returns `skipped-local`. The installed SDK can silently no-op without runtime purge context, so production effectiveness requires live verification, not merely a resolved promise.
- [x] Add save-handler tests: denied auth/origin and failed DB saves never invalidate; successful save invalidates only the chat tag; save succeeding but invalidation rejecting still returns persisted `updatedAt` with `cacheRefresh: "failed"` and a non-sensitive warning, not a false DB failure. Use the existing admin audit conventions; keep response fields additive.
- [x] Execute invalidation only after the DB commit. A successful response reports `cacheRefresh: "invalidated"` or `"skipped-local"`; document that invalidation is SWR, so the next request may serve stale once, then refresh. Fresh config reads on misses avoid stale module values on another instance. Server-side enforcement remains authoritative during that short UI delay.
- [x] In the existing admin save-result notification, distinguish a saved setting with failed cache refresh from a failed save; do not add a new settings control. Pin the notification result with a fixture test and follow the repository UI contracts.
- [x] Run focused tests and `pnpm typecheck`; expect pass. Commit named page/cache/save/tests files with `perf: cache public chat shell with targeted invalidation`.

### Task 4: Verify the Public Boundary and Publish the Rollout Gate

**Files:** Create `docs/operations/public-chat-cdn-cache.md`; extend relevant fixtures/tests from Tasks 1-3 and existing prompt/preset tests only as needed.

- [x] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`; all passed locally on October 3, 2026: 421 unit tests and 2 dedicated telemetry golden tests, zero failing tests, typecheck/lint/build exit 0. Existing loader/main-field deprecations, five security lint warnings, and the large `/studio` props warning are recorded separately. No Notion 429 was observed; this build does not prove all production routes work.
- [x] Start the production build locally. Inspect actual `/chat` HTML and the build-ID-matched Next data route, including empty-query public and query-bearing private policies, allowlisted props, title/navigation, and browser bundle exclusion. Eight HTML/data requests and 14 browser chunks passed on build `krJt670eOSZUQHs0fGmNk`. Query sentinels appear in private framework HTML, but not projected props. Local checks do not prove Vercel CDN hits or purge propagation.
- [x] Preserve existing false defaults for legacy omitted `context.enabled`, `showTelemetry`, and `showCitations` in the public projection. A serialization regression test failed before the bounded fix and passed afterward; saved settings and server policy are unchanged.
- [x] Test A/B settings isolation with independent JSDOM session stores using identical public props, without paid chat requests. Preset selection/reset/custom-prompt preservation execute real provider/settings code. Controller Chrome checks confirmed title/navigation, all four presets, citations override/reset, advanced summary/model choices, and message draft entry/clear without Send. The custom system prompt has no exposed browser field; its preservation is fixture evidence.
- [ ] Stronger isolation proof in separate real browser profiles/cookie contexts remains pending: the available controller browser tool does not create independent contexts. Do not claim that fixture or single-context UI checks establish this stronger proof.
- [x] Document rollback: disable chat shared cache first, preserving the safe public projection; revert header loading separately only if navigation breaks. Do not roll back to serializing private config. Runbook: `docs/operations/public-chat-cdn-cache.md`.
- [ ] Request independent code review, address important findings, then open/attach a PR. Do not merge, deploy, change plan tier, invoke ingestion, or run a full production sitemap sweep as part of preparing the PR.
- [ ] After separately authorized merge and Ready deployment, verify the exact production commit and repeated `/chat` HTML/data MISS-to-HIT behavior, tag invalidation using an approved benign admin save, and no private fields/user data. Do not change effective chat policy merely to test invalidation. A pending purge verification must remain explicitly pending.
- [ ] Observe post-release complete daily windows for CPU and ISR Writes separately. Targets from the existing 70% budget are below 336 CPU seconds/day and approximately 4,667 ISR write units/day averaged over seven days. Preserve selected dashboard window, timezone, deployment counts, and monitor/sweep events. Neither cache HIT nor a cumulative alert proves billing improvement.

## Separate ISR Diagnostic Follow-Up

Before proposing another public ISR change, compare sanitized, fixture-driven props for identical Notion content at different times and identify fields that change unnecessarily (including auxiliary collection results or metadata). Measure compressed size separately from uncompressed JSON. Never remove renderer-required fields based only on size. Review post-deployment sweeps and manual refresh audits before attributing all writes to genuine visits. No signed-URL churn was observed in the single `/studio` snapshot above.

## Official References

- [ISR usage and write-unit semantics](https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing)
- [CDN eligibility and cache behavior](https://vercel.com/docs/caching/cdn-cache)
- [Cache tags and scoped invalidation](https://vercel.com/docs/caching/cdn-cache/purge)
- [SSR cache-control directives](https://vercel.com/docs/caching/cache-control-headers)

## Execution Gate

Status: user approved this plan on October 2, 2026 and requested continuation. Tasks 1-3 are implemented and reviewed; Task 4 local validation and rollout documentation are complete. PR preparation is authorized and the controller coordinates independent final review and PR creation. PR, merge, deployment, CDN/purge effectiveness, stronger real-browser isolation, and billing proof remain separate pending gates. Preserve the requested Subagent-driven method. PR #215 remains an independent change; this plan does not authorize its merge.
