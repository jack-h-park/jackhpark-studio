# Public Chat CDN Cache Operations

## Scope and Current Evidence

The `/chat` Pages Router shell uses explicit public configuration props and a
chat-only cache tag. This change prepares a production rollout; it does not
establish deployed CDN hits, effective purge propagation, or lower billing.
Merge and deployment require separate authorization. Preview deployments remain
suppressed, and public Notion ISR remains 3,600 seconds.

Completed local evidence is recorded in the implementation plan and task report.
Independent JSDOM session stores exercise the real settings provider's custom
prompt, numeric override, summary setting, and reload behavior with identical
public props. They are browser-equivalent storage fixtures, not isolated real
Chrome profiles or cookie contexts. Controller browser checks and stronger
browser isolation proof must be reported separately. On October 3, 2026, the
controller's real Chrome check confirmed the page title, root `/studio` link,
Experience & Background and Personal Craft links, `/chat`, all four preset
radios, citations override and reset, advanced summary/model choices, and message
draft entry/clear without sending. Reset restored citations off and removed the
Custom indicator. Dark page and light settings screenshots were inspected, then
dark mode was restored. These checks used one browser context and made no paid
chat request or admin save. No browser field exposes the custom system prompt;
its preservation is covered by the real settings-provider fixtures.

The final local production build `krJt670eOSZUQHs0fGmNk` passed eight HTML/data
GET checks: empty query, independent harmless A/B cookies, and a query sentinel.
The public responses had the documented policy/tag, matching allowlisted props,
and one unique root block under two ID aliases. Query responses were private and
untagged; their projected props excluded the sentinel while private framework
HTML included it. Fourteen loaded browser chunks omitted the checked server-only
module markers; the repository's server-only import check also passed. Following
the legacy boolean fix and rebuild, the controller rechecked title/navigation,
Fast/Balanced selection, and citations override/reset in Chrome.

## Response Boundary

| Request or outcome                                                                                                 | Cache policy                                                                   | Chat tag               |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------- |
| Successful anonymous HTML or build-ID data request with empty query and valid header                               | `public, max-age=0, s-maxage=900, stale-while-revalidate=60`                   | `public-chat-shell-v1` |
| Any query key, authorization, draft/preview mode, personalization, `Set-Cookie`, non-200 result, or missing header | `private, no-store`                                                            | Absent                 |
| Configuration/header load exception                                                                                | Starts private/no-store; framework error response must also remain uncacheable | Absent                 |

Cookie presence alone does not personalize this shell: its loader does not read
cookie values or load a user session. Future session-dependent behavior must
bypass shared caching before reading the session. Conversation and chat runtime
APIs do not inherit this page policy.

Page props contain only `adminConfig`, `runtimeMeta`, `headerRecordMap`, and
`headerBlockId`. Public config root keys are `baseSystemPromptSummary`,
`numericLimits`, `allowlist`, `summaryPresets`, and `presets`. Each preset contains
public model choices, RAG/context/features controls, summary level, safe mode,
telemetry visibility, and citation visibility. Public runtime metadata contains
model availability/default fields and model-resolution entries. The navigation
map contains only the root block and empty auxiliary maps.

Private base/preset prompts, local-provider policy, reasoning policy, guardrails,
ranking, generation, cache settings, telemetry configuration, unknown admin
fields, and request/session data are excluded from projected props. The server
still composes private prompts and enforces presets. A visitor's additional
prompt starts empty and persists only in that visitor's session storage.

Legacy saved presets can omit `context.enabled`, `showTelemetry`, or
`showCitations`. Their public projection explicitly serializes `false`, matching
the existing client settings sanitizer; configured `true` and `false` values
are preserved. This does not rewrite saved administrator settings or change
server policy.

Next independently serializes query values in HTML `__NEXT_DATA__.query`.
Consequently query-bearing responses are private and untagged even when their
page props are safe. Inspect projected props separately from framework data;
do not assert that a private query response's entire HTML omits its query.

## Local Verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`. Record warnings
separately from failures. A normal build can read Notion; rate limits or a
partial local crawl do not prove all production routes work. Do not invoke
ingestion, paid chat requests, or a production sitemap sweep for this check.

Use an already configured environment. For a worktree with no local env file,
pass a separately supplied private file through Node's direct `--env-file`
argument and let child processes inherit the environment. Do not put that flag
in `NODE_OPTIONS`, copy secrets into tracked files, or print secret values.

After checking that the port is free, run `pnpm start --port 3127`. On localhost:

1. GET `/chat`, parse `__NEXT_DATA__`, and read its `buildId`.
2. GET `/_next/data/<buildId>/chat.json` using that same running build.
3. Require 200 responses, the public cache policy, and the chat tag on both.
   Check exact allowlisted props and every nested public key, title `Ask JackGPT`,
   navigation links, and browser bundle exclusion of server-only modules.
4. Repeat HTML/data GETs with harmless arbitrary cookies and confirm identical
   projected props without cookie values. Add a harmless query sentinel and
   require private/no-store with no tag on both. The sentinel may appear in
   framework HTML query data, but must not appear in page props.
5. Without sending a chat, select/reset all four presets and edit a genuine
   custom prompt. Verify public choices, summary controls, clamping, and reload
   behavior. Use independent session-store fixtures for A/B settings; record
   real browser context isolation only when the browser tool actually supports
   and exercises separate contexts.

Local Next can show the selected headers and safe serialization. It does not
provide Vercel CDN MISS/HIT or tag propagation evidence. A successful local save
reports `cacheRefresh: "skipped-local"` and does not purge production.

## Saved Settings and Cache Refresh

Admin authentication and origin checks precede persistence. A successful DB
save invalidates only `public-chat-shell-v1`. Failure to save does not invalidate.
If persistence succeeds but invalidation rejects, the response remains 200 with
the persisted `updatedAt`, `cacheRefresh: "failed"`, and a non-sensitive warning.
The administrator should see a saved setting with a cache-refresh warning.
Do not report the setting as unsaved or repeatedly change policy to provoke a
purge. Cached public controls can remain visible until refresh; server policy
continues to be authoritative.

`invalidateByTag()` uses stale-while-revalidate: the next request can serve stale
content while a refresh runs, followed by fresh content. The installed SDK can
resolve without effective runtime purge context. Thus `cacheRefresh:
"invalidated"` records a resolved SDK request, not independently proven global
purge success. Verify deployment-bound HTML and data after a separately approved
benign save; leave propagation pending when evidence is unavailable. See
[Vercel's tag invalidation semantics and environment scope](https://vercel.com/docs/caching/cdn-cache/purge).

## Production Rollout Gate

- [ ] Independent code review completed and important findings addressed; PR
      opened with all required checks passing.
- [ ] Merge and deployment separately authorized; exact source commit confirmed
      in a Ready deployment and on the intended production alias.
- [ ] Repeated empty-query `/chat` and matching build-ID data GETs establish
      MISS-to-HIT behavior. Record timestamps, cache headers/status, age, build ID,
      and deployment identity. Avoid paid API calls or a route sweep.
- [ ] Private field exclusion and cookie-independent shell verified for both
      response forms. Query-bearing HTML/data remain private and untagged.
- [ ] Approved benign admin save preserves effective chat policy, records the
      persisted timestamp/result, and demonstrates tag refresh on both HTML and
      data, allowing the documented stale response. No project/image-cache purge.
- [ ] Real browser session isolation verified in separate supported contexts;
      record this as pending when only fixtures or one browser context are available.
- [ ] CPU and ISR Writes observed in complete post-release daily windows,
      preserving selected window, timezone, deployments, and monitor/sweep events.

From the existing 70% budget, targets are below 336 CPU seconds/day and about
4,667 ISR write units/day averaged over seven days. Assess CPU and ISR Writes
separately. A cache HIT or cumulative quota email does not prove billing savings.
Keep unrelated ISR output-stability diagnosis outside this rollout.

## Rollback

First disable shared chat caching by keeping the page loader's initial
`private, no-store` policy and omitting the public-header/tag branch. Preserve
the public projection and session-only overrides. Under approved rollout
authority, deploy that bounded rollback and confirm HTML/data are private and
untagged on the exact deployment. If an existing entry must be refreshed sooner,
use only the chat tag under separately approved purge authority.

Only if navigation is broken, restore the previous header-loading path in a
separate change while preserving the public props and private cache policy.
Do not restore full administrator serialization or purge the whole project.
Keep public Notion ISR, Preview suppression, conversation APIs, RAG, answer
caching, and effective model policy unchanged.

## References

- [Implementation plan](../superpowers/plans/2026-10-01-public-chat-cdn-cache.md)
- [Vercel cache-control directives](https://vercel.com/docs/caching/cache-control-headers)
- [CDN eligibility](https://vercel.com/docs/caching/cdn-cache)
- [ISR usage and write units](https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing)
