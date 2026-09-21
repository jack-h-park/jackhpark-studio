# Vercel Usage Recovery Design

## Purpose

Keep the public portfolio current after a Notion edit while reducing the
steady-state Vercel Fluid Active CPU and ISR Write usage that currently exceed
the team's included monthly allowances. The design must not re-enable Preview
deployments, publish private chat configuration, or make an ordinary Notion
read failure serve a permanent 404.

## Confirmed Decisions

- Public Notion pages use a 60-minute normal ISR interval.
- An authenticated administrator explicitly refreshes affected public paths
  after editing Notion; an external Notion webhook is out of scope.
- `/chat` is eligible for CDN caching only after its browser-visible data has a
  deliberately defined public contract.
- Production deployment retention remains an operational policy, not an
  application-code substitute for compute reduction.

## Current Evidence

The deployed public page cadence is five minutes for `/studio` and
`/[pageId]`, and the Notion record-map cache uses the same five-minute TTL.
The current usage dashboard's rolling window reports both ISR Writes and
Fluid Active CPU above their included limits. Runtime evidence also shows that
the historical sitemap-cache failure created thousands of failed public-page
renders before the current deployment, so post-change success must be measured
against a fresh time window rather than treating the existing rolling total as
an immediate pass/fail result.

`/chat` currently uses `getServerSideProps` for every uncached request and
loads both the full admin chat configuration and a Notion-backed navigation
header. Its server module cache helps warm instances only; it is not a
cross-region CDN cache. The full configuration is passed to browser code, so a
cache policy must not be added before the browser contract is narrowed and
tested.

## Architecture

### 1. Public-page freshness boundary

Set the normal successful ISR interval for `/studio` and `/[pageId]` to 3600
seconds. Keep the existing short `/studio` error fallback unchanged: a
transient Notion failure must remain retryable rather than being published as a
long-lived not-found page.

Notion record-map caching must use the same 3600-second normal interval. This
prevents an on-demand regeneration from doing duplicate Notion work when a
fresh record map already exists, while preserving a bounded maximum staleness
if the manual refresh is missed.

### 2. Authenticated targeted revalidation

Add a same-origin, authenticated administrator mutation endpoint under
`/api/admin/`. It must use the existing `requireAdminApiAccess`,
`requireSameOriginMutation`, and `auditAdminMutation` conventions. No public
secret-bearing endpoint is introduced for this manual workflow; a future
machine-to-machine webhook would be a separate design with a dedicated secret
and signature verification.

The endpoint accepts exactly one approved target per request:

- `/studio`; or
- a single canonical public page path resolved from the bundled canonical page
  map.

It rejects non-string input, URLs, query strings, fragments, multi-segment
paths, private/admin/API paths, and unknown canonical paths before calling
`res.revalidate`. It returns the canonical path and a server timestamp on
success. A revalidation exception returns a non-sensitive failure response and
records an audit failure; it does not invalidate a previously successful page.

Refreshing all public pages in one action is deliberately excluded. A full
portfolio crawl/rebuild would concentrate the very Notion and CPU work this
change is intended to avoid.

### 3. Admin workflow

Add a small "Public site refresh" card to the existing ingestion dashboard.
The card makes the operational sequence explicit: edit a public Notion page,
choose `/studio` or its canonical public URL, then refresh that one target.
It disables its control while the request is in progress and shows an
accessible success or failure notice containing the revalidated path. It does
not trigger RAG ingestion, change Notion, or perform a deployment.

The control should reuse the repository's existing admin page shell, Button,
card, and notification patterns. It must remain separate from the manual RAG
ingestion panel because a public-page cache refresh and a corpus ingest have
different side effects and completion semantics.

### 4. Chat-shell cache investigation and contract

Do not cache `/chat` wholesale in the first delivery. First define a
`PublicChatConfig` projection containing only browser-required values, replace
the public page's dependency on `AdminChatConfig` with that projection, and
pin that prohibited fields such as system prompts, telemetry configuration, and
server-only provider policy cannot appear in serialized `/chat` page data.

After the contract exists, serve the anonymous chat shell with a short shared
CDN cache (15 minutes, stale-while-revalidate enabled) and explicit
invalidation when the chat configuration is saved. The chat conversation API,
authenticated admin pages, and any response containing user-specific content
remain uncacheable. This phase is separate because it changes a public data
interface and must be reviewed independently of ISR cadence.

### 5. Invalid dynamic-route guard

Before `resolveNotionPage` asks Notion or the sitemap to resolve an unknown
`/[pageId]` value, reject requests that cannot be a supported canonical slug
or Notion ID. This includes dotfiles, apparent asset extensions, malformed
UUID-like values, and blocked internal prefixes. Valid canonical slugs retain
their current lookup behavior. The guard returns the existing 404 result and
does not log the rejected value as a Notion fetch failure.

## Non-Goals

- Reintroducing Preview deployments or Preview image processing.
- Rebuilding all content after every Notion edit.
- Moving further public assets to R2; that reduces deployment storage, not the
  ISR/CPU issue addressed here.
- Automating from Notion webhooks in this release.
- Altering RAG retrieval, chat-answer caching, or the administrator's current
  model configuration policy.

## Error Handling and Security

- Every admin refresh mutation requires the existing Google-admin session and
  same-origin check.
- Route validation is allowlist-based; the endpoint never treats caller input
  as an arbitrary Vercel revalidation path.
- Audit events identify the actor, request ID, action, target, and outcome but
  never include credentials or Notion record maps.
- A failed refresh preserves the last successful ISR output.
- The UI presents a recoverable error and permits a retry; it does not claim a
  Notion edit has been published until the endpoint reports success.

## Verification and Success Criteria

Automated tests must cover the 3600-second ISR and record-map-cache contract,
authorised and unauthorised refreshes, cross-origin rejection, all invalid
target classes, one valid canonical target, `res.revalidate` failure, and the
absence of server-only chat fields from serialized public page props.

Before merge, run the focused tests plus the repository typecheck, lint,
path-leak guardrail, and production build. After production is Ready, verify:

1. `/studio` and a canonical public page advertise the expected ISR behaviour;
2. an authenticated refresh of one target produces fresh output without a
   deployment;
3. the unauthenticated and cross-origin endpoint cases fail safely;
4. Preview deployments remain cancelled; and
5. Vercel Usage shows a falling daily ISR Write and Fluid Active CPU rate over
   at least seven post-release days.

The operational target is a projected rolling-30-day rate below 70% of each
included ISR Write and Fluid Active CPU allowance, leaving room for an unusual
traffic day. Storage must be reviewed separately after the retention-policy
change ages out prior deployments.

## Rollout Order

1. Deliver the ISR interval, targeted refresh endpoint, and admin control.
2. Observe daily Vercel usage and refresh audit events for seven days.
3. Audit and deliver the public chat-config projection and cached anonymous
   shell as a follow-on change if CPU remains materially above target.
4. Add the invalid dynamic-route guard if runtime logs continue to show
   scanners causing Notion lookup errors; it is safe to ship independently.
