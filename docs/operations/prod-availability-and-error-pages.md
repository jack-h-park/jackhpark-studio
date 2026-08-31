# Prod availability and error-page improvement plan

Status: implementation started 2026-08-31

## Objective

Detect failures across the public site before a visitor reports them, deliver a
useful fallback page when rendering fails, and keep chat-event notifications
separate from service-availability alerts.

## Scope and route contract

The monitor uses the canonical production origin `https://www.jackhpark.com`.

### Core checks (every 5 minutes)

- HTML: `/`, `/chat`, `/studio`, `/feed`, `/admin/sign-in`
- APIs: `/api/ping`, `/api/chat-config`, `/api/chat-runtime`
- Asset: `/assets/avatar-favicon/error.png` must return `2xx` and `image/png`
- `/api/chat` `GET` must return `405` because the endpoint is POST-only

The `/chat` check must validate both HTTP success and the `Ask JackGPT` title.
The `/` check validates the rewrite to the chat experience.

### Extended checks (nightly or manual)

- `/landing` allows its expected redirect status.
- `/robots.txt`, `/sitemap.xml`, and `/404` retain their expected contracts.
- URLs discovered from the sitemap are sampled first, then fully crawled during
  a low-frequency run to avoid turning monitoring into a Notion rate-limit load.
- Protected admin APIs are checked with their expected `401`/`403` contract,
  never with production credentials in a public monitor.

## Alert contract

- Two consecutive failures create one incident alert.
- The alert includes route, status, latency, deployment ID when available, and
  a short response excerpt without secrets or visitor questions.
- Repeated failures are deduplicated; a successful check closes the incident
  and sends one recovery notification.
- Telegram chat-start notifications remain a separate product-event signal.

## Implementation phases

1. Add a dependency-free Node smoke runner and scheduled external-runner
   workflow. Configure the runner to target the canonical origin.
2. Add Telegram/email failure and recovery delivery using repository/monitor
   secrets, with a documented secret checklist. Do not reuse visitor-question
   notifications as an uptime signal.
3. Replace the custom 500/404 fallback with a dependency-light, accessible
   page: clear status-specific copy, retry/home actions, responsive/dark theme,
   and a resilient image fallback.
4. Run post-deploy smoke checks against the canonical alias and retain the
   result as a deployment artifact.
5. Exercise a controlled failure, verify alert deduplication and recovery, then
   document the incident response runbook.

## Acceptance criteria

- A broken `/chat`, core HTML route, API contract, or error asset fails the
  smoke job with a route-specific diagnostic.
- A production failure creates an owner notification within five minutes and
  a recovery notification after restoration.
- The 500 fallback renders without Notion, API, native-image, or chat imports.
- The fallback image cannot produce a broken-image icon when the primary asset
  is unavailable.
- A deployed canonical URL check passes after every production deployment.

## Current implementation

- The chat SSR `sharp` failure was fixed and deployed.
- The broken error illustration reference was fixed to the tracked asset at
  `/assets/avatar-favicon/error.png`.
- A dependency-free smoke runner now checks the core canonical HTML routes,
  API contracts, and error asset. The scheduled workflow runs it every five
  minutes and can notify Telegram on failure.
- The external monitor registration, deduplicated recovery notifications,
  extended sitemap checks, and notification secret configuration remain as
  deployment/operations follow-up.
