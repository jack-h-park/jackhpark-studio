# Vercel Residual Load Review — 2026-09-30

## Scope and evidence limits

This review separates observed runtime work from billing attribution. Production
was Ready at commit `01652519910ad8465724c37162dd17fdd5d5ee09` before this change.
The selected rolling-30-day dashboard window reported 5h59m Fluid Active CPU
and 338,114 ISR Write Units. These historical totals cannot establish the effect
of a new release. The 12-hour route breakdown below is a different window and
must not be equated with the rolling total or a complete daily CPU measurement.

## 1. Invalid dynamic routes

Production `GET /xmlrpc.php` returned HTTP 200 on September 30. Its serialized
page props contained a 404 error, and its matched route was `/[pageId]`.
The resolver returned error props for an unknown slug, but `getStaticProps`
unconditionally returned those props with hourly ISR. Rendering an error screen
does not set the HTTP status. Consequently, scanner paths could receive cached
200 error pages and become periodic regeneration targets.

The fix has two boundaries:

- Reject syntactically unsupported inputs before cache, sitemap, or Notion
  lookup; return `notFound: true` without periodic regeneration.
- Mark an unresolved route explicitly as `UNKNOWN_ROUTE` and translate only
  that result to a real 404 with a one-hour negative-cache retry interval.
  Valid slugs, compact/hyphenated Notion IDs, and manual refresh remain supported.
  Every current sitemap URL passed the syntax check.

Thrown fetch failures and unclassified ACL/record-shape errors remain failures,
not cached 404s. This preserves the last healthy ISR artifact during an upstream
outage. A scanner request may still incur routing, a first function invocation,
and negative-cache storage. This change does not promise zero cost or establish
what fraction of historic CPU came from scanners.

The syntax guard is deliberately not a public-page membership check. Its UUID
grouping check covers inputs containing 32 hexadecimal digits with misplaced
hyphens, but other malformed ID-like strings may still look like valid title
slugs and reach sitemap lookup. URI-cache expiry, inherited-property lookup,
and canonical-map completeness are existing resolver limitations, not resolved
by this patch. A future public-route registry must explicitly cover allowed
aliases and Notion IDs before tightening membership checks.

After merge and Ready, check one scanner path for HTTP 404, one canonical page
for HTTP 200, and an authenticated targeted refresh for success. Compare equal
post-release windows, including deployments and monitor requests.

Local verification passed: 386 tests, TypeScript, lint (five existing warnings),
path-leak guardrails, and the production build including sitemap-trace checking.
The running production build returned 404 for `/xmlrpc.php` and an unknown slug,
and 200 for `/studio` and `/beluga`. Chrome displayed the expected not-found
screen. Build-time Notion 429 retries occurred and the local sitemap reported
164 pages; this is not proof that all 167 production sitemap URLs were rendered.
The syntax audit covers those production URLs, not their content availability.
No merged/deployed status or production savings is claimed for this fix yet.

## 2. Chat shell — next independent change

The 12-hour function table showed 99 `/chat` invocations and 57 seconds Active
CPU, versus 285 dynamic-page invocations and approximately one minute CPU.
`/chat` forces a configuration refresh on each SSR request and loads a full
Notion root record map before retaining only the header subset. It currently
returns a private, no-store response.

Do not add shared caching to the existing serialized admin configuration.
First define and test the browser-required public projection, then narrow the
navigation fetch and introduce the cache/invalidation contract in the existing
usage-recovery design. This review does not implement or validate that follow-on.

## 3. Monitoring and deployment verification

Checkly declares five public-route checks every 15 minutes. A separately
configured operational smoke job also declares a 15-minute cadence and delegates
to the repository's 13-route smoke script. The observed 48 calls per API route
over 12 hours match that cadence; execution of the external scheduler was not
verified because its host rejected SSH authentication.

GitHub production smoke also ran, and two successful production-deployment
sitemap sweeps on September 29 each requested 166 paths. Sweeps can warm cold
fallback pages and contribute writes. Daily totals around 10,000 units must not
be labeled steady-state until sweep/deployment activity is separated.

Next: confirm operational ownership and actual schedules, retain one primary
availability monitor, and reduce duplicate heavy probes without deleting safety
coverage. No remote scheduler or Checkly configuration was changed here.

## 4. Ingestion errors — independent correctness issue

Runtime logs showed four HTTP 500 responses for ingestion requests carrying
`pageId=page-123`. The caller identified itself as `hermes-publisher
(rag_refresh.py,1.0)`. Validation rejected the input, but the endpoint classified
the exception as an internal failure. One request used approximately 15 ms
function time; these errors do not explain the full CPU total. The broader
12-hour ingestion error rate includes other responses and was not fully traced.

Next: reject malformed IDs before ingestion with a client error and trace the
publisher input at its source. Do not invoke ingestion merely to diagnose it:
authorized requests can mutate the corpus. No ingestion request was triggered
as part of the improvement verification.
