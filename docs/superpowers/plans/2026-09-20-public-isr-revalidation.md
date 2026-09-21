# Public ISR Revalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce steady-state public-site ISR and Notion work by using a 60-minute cadence with an authenticated administrator control that refreshes one public page on demand.

**Architecture:** The Pages Router retains ISR for `/studio` and `/[pageId]`, but their normal interval and the Notion record-map cache move from 300 to 3600 seconds. A new admin-only API route validates one canonical public target, calls the existing Pages Router `res.revalidate` primitive, and records the established admin mutation audit event. A small client hook and dashboard card invoke that route; they neither ingest RAG content nor deploy the site.

**Tech Stack:** Next.js 15 Pages Router, React 19, TypeScript, NextAuth admin sessions, Vercel ISR, existing admin UI primitives, Node test runner via `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-20-vercel-usage-recovery-design.md`

## Global Constraints

- Set normal successful public ISR and Notion record-map cache expiry to exactly 3600 seconds.
- Preserve the existing 10-second `/studio` error fallback; do not turn a transient Notion error into a cached 404.
- Keep Preview deployments cancelled and do not re-enable Preview image processing.
- The refresh endpoint must require the existing Google-admin session and same-origin mutation check; do not add a browser-held secret or public webhook endpoint.
- Revalidate exactly one approved canonical public path per request; never implement a “refresh all pages” action.
- Reuse `auditAdminMutation` and emit no ad-hoc logging or sensitive configuration/record-map data.
- Do not change chat-shell caching, RAG ingestion, deployment retention, or Cloudflare R2 in this implementation; each has an independent rollout boundary.

## Review Focus

- A Notion outage during `/studio` regeneration must preserve the existing short error fallback and must not cache `notFound`.
- An authenticated administrator submitting a URL, query string, fragment, admin/API path, dotfile, extension-like path, or unknown slug must get a validation failure before `res.revalidate` is called.
- An unauthenticated request, non-POST request, or cross-origin mutation must not reach revalidation and must use the repository’s normal auth/method semantics.
- A successful refresh must be for one canonical path only; the response and admin card must name that exact path rather than implying the whole site changed.
- A failed Vercel revalidation must retain the previous public artifact, be audited as failure, and leave the UI retryable.

---

### Task 1: Pin the One-Hour Public ISR Contract

**Files:**
- Modify: `site.config.ts:42-44`
- Modify: `pages/studio.tsx:10-25`
- Modify: `pages/[pageId].tsx:9-26`
- Modify: `test/production-isr-budget.test.ts:9-20`

**Interfaces:**
- Consumes: existing `site.config` `notionPageCacheTTLSeconds` and Pages Router `getStaticProps` returns.
- Produces: a source-level contract that the normal public-page and Notion record-map lifetime is 3600 seconds while the `/studio` error fallback remains 10 seconds.

- [ ] **Step 1: Change the failing ISR budget test to state the one-hour contract**

Replace the existing five-minute assertions with exact normal-cadence assertions and add a bounded error-fallback assertion:

```ts
assert.match(siteConfig, /notionPageCacheTTLSeconds:\s*3600/);
assert.match(studioPage, /return \{ props, revalidate: 3600 \}/);
assert.match(notionPage, /revalidate:\s*3600/);
assert.match(studioPage, /notFound: true,\s*revalidate: 10/);
```

- [ ] **Step 2: Run the focused test and verify it fails on the current five-minute values**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/production-isr-budget.test.ts`

Expected: FAIL because `site.config.ts`, `pages/studio.tsx`, and `pages/[pageId].tsx` still contain `300` for their successful cache/revalidate values.

- [ ] **Step 3: Set the normal cache and ISR values to 3600 without changing the recovery path**

Make only these value changes:

```ts
// site.config.ts
notionPageCacheTTLSeconds: 3600,

// pages/studio.tsx, successful branch
return { props, revalidate: 3600 };

// pages/[pageId].tsx, successful branch
revalidate: 3600,
```

Retain the existing `/studio` catch branch exactly as `notFound: true` with `revalidate: 10`; it is the transient-error retry policy, not the normal-content cadence.

- [ ] **Step 4: Run the focused ISR and cached-404 regression tests**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/production-isr-budget.test.ts test/notion-page-error-path.test.ts`

Expected: PASS. The source contract reports 3600 for successful renders, 10 for the `/studio` error retry, and the dynamic-page error path still rethrows rather than publishing a cached 404.

- [ ] **Step 5: Commit the isolated cadence change**

```bash
git add site.config.ts pages/studio.tsx 'pages/[pageId].tsx' test/production-isr-budget.test.ts
git commit -m "perf: extend public ISR cadence"
```

### Task 2: Add the Safe Single-Target Revalidation Service and Admin API

**Files:**
- Create: `lib/server/public-page-revalidation.ts`
- Create: `pages/api/admin/revalidate-public-page.ts`
- Create: `test/public-page-revalidation.test.ts`
- Modify: `test/production-isr-budget.test.ts:9-20`

**Interfaces:**
- Consumes: `getSiteMap()` from `lib/get-site-map.ts`, `requireAdminApiAccess`, `requireSameOriginMutation`, and `auditAdminMutation` from `lib/server/admin-auth.ts`, plus Pages Router `NextApiResponse.revalidate(path)`.
- Produces: `resolvePublicPageRevalidationTarget(input: unknown, canonicalPageMap: Record<string, string>): PublicPageRevalidationTarget | null` and an authenticated `POST /api/admin/revalidate-public-page` endpoint returning `{ revalidatedPath: string; revalidatedAt: string }` on success or `{ error: string }` on failure.

- [ ] **Step 1: Write failing pure target-resolution tests**

Create `test/public-page-revalidation.test.ts` with a pure resolver seam. Pin the allowed root and a canonical slug, and reject every invalid class before any revalidation callback is provided:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePublicPageRevalidationTarget } from "@/lib/server/public-page-revalidation";

const canonicalPageMap = { beluga: "notion-page-id" };

void describe("public page revalidation targets", () => {
  void it("accepts only studio or a canonical single-segment slug", () => {
    assert.deepEqual(resolvePublicPageRevalidationTarget("/studio", canonicalPageMap), { path: "/studio" });
    assert.deepEqual(resolvePublicPageRevalidationTarget("/beluga", canonicalPageMap), { path: "/beluga" });
  });

  void it("rejects paths that are not one canonical public page", () => {
    for (const target of ["https://example.com/beluga", "/beluga?x=1", "/beluga#x", "/admin", "/api/ping", "/.env", "/photo.jpg", "/unknown", "/a/b"]) {
      assert.equal(resolvePublicPageRevalidationTarget(target, canonicalPageMap), null, target);
    }
  });
});
```

Add source-contract assertions to `test/production-isr-budget.test.ts` that the new API route imports all three existing admin-auth helpers and calls `res.revalidate`; this protects the thin route’s security boundary without duplicating NextAuth internals in a unit test.

```ts
const revalidationRoute = await readFile(
  path.join(repoRoot, "pages", "api", "admin", "revalidate-public-page.ts"),
  "utf8",
);
assert.match(revalidationRoute, /requireAdminApiAccess/);
assert.match(revalidationRoute, /requireSameOriginMutation/);
assert.match(revalidationRoute, /auditAdminMutation/);
assert.match(revalidationRoute, /await res\.revalidate\(target\.path\)/);
```

- [ ] **Step 2: Run the new test and verify the module cannot yet be resolved**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/public-page-revalidation.test.ts`

Expected: FAIL with a module-not-found error for `lib/server/public-page-revalidation`.

- [ ] **Step 3: Implement deterministic path resolution and the protected route**

In `lib/server/public-page-revalidation.ts`, define these exact types and function:

```ts
export type PublicPageRevalidationTarget = { path: string };

export function resolvePublicPageRevalidationTarget(
  input: unknown,
  canonicalPageMap: Record<string, string>,
): PublicPageRevalidationTarget | null {
  if (input === "/studio") return { path: "/studio" };
  if (typeof input !== "string" || !/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(input)) return null;
  const slug = input.slice(1).toLowerCase();
  return canonicalPageMap[slug] ? { path: `/${slug}` } : null;
}
```

The API route must:

```ts
const admin = await requireAdminApiAccess(req, res);
if (!admin) return;
if (req.method !== "POST") {
  res.setHeader("Allow", ["POST"]);
  return res.status(405).json({ error: "Method Not Allowed" });
}
if (!requireSameOriginMutation(req, res)) {
  auditAdminMutation({ ...admin, action: "revalidate", target: "public-page", result: "failure" });
  return;
}
```

Read `req.body.path`, load `getSiteMap().canonicalPageMap`, resolve it with the helper, and return `400` for an invalid target. On a valid target, call `await res.revalidate(target.path)`, audit `action: "revalidate"` with the exact canonical target, then return `200` with `revalidatedPath` and `new Date().toISOString()`. On a thrown revalidation error, audit failure and return `500` with the fixed message `"Unable to refresh the public page."`; do not serialize the caught error.

- [ ] **Step 4: Run the resolver and route-contract tests**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/public-page-revalidation.test.ts test/production-isr-budget.test.ts`

Expected: PASS. The resolver accepts only `/studio` and known canonical slugs, and the route source proves it has admin authentication, same-origin protection, audit logging, and Pages Router revalidation.

- [ ] **Step 5: Commit the protected server boundary**

```bash
git add lib/server/public-page-revalidation.ts pages/api/admin/revalidate-public-page.ts test/public-page-revalidation.test.ts test/production-isr-budget.test.ts
git commit -m "feat: add admin public page revalidation"
```

### Task 3: Add the Administrator’s Targeted Refresh Control

**Files:**
- Create: `hooks/usePublicSiteRefresh.ts`
- Create: `components/admin/ingestion/PublicSiteRefreshPanel.tsx`
- Modify: `pages/admin/ingestion.tsx:10-24, 96-120`
- Test: `test/public-site-refresh-ui.test.ts`

**Interfaces:**
- Consumes: `POST /api/admin/revalidate-public-page` with JSON `{ path: string }`, existing `Button`, `CardHeader`, `CardTitle`, `CardDescription`, `StatusPill`, and the admin ingestion dashboard layout.
- Produces: `usePublicSiteRefresh()` state `{ path, setPath, status, message, isRefreshing, refresh }` and a `PublicSiteRefreshPanel` that submits one path and displays the exact result.

- [ ] **Step 1: Write the failing UI source-contract test**

Create `test/public-site-refresh-ui.test.ts` that reads the new hook and panel source. Require the user-facing workflow and safe request shape:

```ts
assert.match(panel, /Public site refresh/);
assert.match(panel, /\/studio/);
assert.match(panel, /Refresh this page/);
assert.match(hook, /fetch\("\/api\/admin\/revalidate-public-page"/);
assert.match(hook, /method:\s*"POST"/);
assert.match(hook, /JSON\.stringify\(\{ path \}\)/);
assert.doesNotMatch(panel, /refresh all/i);
```

Also assert that `pages/admin/ingestion.tsx` imports and renders `PublicSiteRefreshPanel` as a sibling of `ManualIngestionPanel`, not inside it.

- [ ] **Step 2: Run the focused test and verify it fails because the UI files do not exist**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/public-site-refresh-ui.test.ts`

Expected: FAIL with an ENOENT error for `components/admin/ingestion/PublicSiteRefreshPanel.tsx`.

- [ ] **Step 3: Implement the hook and panel with one explicit target**

Implement the hook with these state transitions:

```ts
type RefreshStatus = "idle" | "refreshing" | "success" | "error";

const response = await fetch("/api/admin/revalidate-public-page", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path }),
});
```

Parse the JSON response defensively. On success, set a message such as `Refreshed /beluga.` using the returned `revalidatedPath`; on a non-OK response or network error, surface only `payload.error ?? "Unable to refresh this page."`. Always clear `isRefreshing` in `finally` so a failed call can be retried.

Implement the panel as a separate `ai-card` with:

- title `Public site refresh`;
- concise instruction: edit Notion, enter `/studio` or a canonical public URL path, then refresh one page;
- a controlled text input initially set to `/studio`;
- a submit button labelled `Refresh this page` that is disabled while refreshing or when the trimmed input is empty; and
- an `aria-live="polite"` status notice that names the exact refreshed path or error.

Render `<PublicSiteRefreshPanel />` in `pages/admin/ingestion.tsx` immediately before `<ManualIngestionPanel />`. Do not modify the RAG ingestion form, its SSE flow, or its styling module unless an existing layout token is insufficient.

- [ ] **Step 4: Run the UI source-contract test and typecheck**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/public-site-refresh-ui.test.ts && pnpm typecheck`

Expected: PASS. The dashboard presents one-target refresh, sends a JSON POST to the admin endpoint, has no all-site action, and TypeScript accepts the hook and component interfaces.

- [ ] **Step 5: Commit the administrator workflow**

```bash
git add hooks/usePublicSiteRefresh.ts components/admin/ingestion/PublicSiteRefreshPanel.tsx pages/admin/ingestion.tsx test/public-site-refresh-ui.test.ts
git commit -m "feat: add public site refresh control"
```

### Task 4: Validate, Deliver, and Measure the First Rollout

**Files:**
- Modify: `docs/superpowers/specs/2026-09-20-vercel-usage-recovery-design.md:143-168`

**Interfaces:**
- Consumes: the merged production deployment, Vercel Usage dashboard, production `/studio` and a canonical page, and the admin dashboard mutation result.
- Produces: a completed first-rollout entry in the design document that distinguishes merged/deployed evidence from the seven-day usage observation still in progress.

- [ ] **Step 1: Run the complete local validation set before opening the pull request**

Run:

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

Expected: all commands succeed. Record any pre-existing lint warnings separately from new failures; do not waive a new warning.

- [ ] **Step 2: Create a pull request and verify required checks before merge**

Run:

```bash
gh pr create --fill
gh pr checks <PR_NUMBER> --watch
gh pr view <PR_NUMBER> --json state,mergeable,statusCheckRollup
```

Expected: the PR is mergeable and all required checks pass before protected-main merge.

- [ ] **Step 3: Verify the production artifact, not only the merge**

After merge, verify the remote merged SHA, Vercel’s Ready deployment source SHA, and canonical HTTP responses:

```bash
gh pr view <PR_NUMBER> --json state,mergedAt,mergeCommit
vercel inspect https://www.jackhpark.com
/usr/bin/curl -sS -D - -o /dev/null https://www.jackhpark.com/studio
```

Expected: merged state, Ready deployment built from the merge SHA, HTTP 200 for `/studio`, and caching headers consistent with ISR. In an authenticated browser session, refresh `/studio` once from the new admin card and verify the success notice; test an unauthenticated request and a cross-origin browser request separately to confirm denial.

- [ ] **Step 4: Start the seven-day usage observation without overstating completion**

On days 1 and 7, capture Vercel Usage values for `ISR Writes`, `Fluid Active CPU`, `Deployment Storage`, and `Function Storage`, plus the selected time window. Add the date, values, and whether the rolling trend is below the 70% target to the rollout section of the design document. Do not mark the target achieved until the seven-day trend supports a projected rolling-30-day rate below 70% for ISR Writes and Fluid Active CPU.

- [ ] **Step 5: Commit only the evidence-backed rollout record**

```bash
git add docs/superpowers/specs/2026-09-20-vercel-usage-recovery-design.md
git commit -m "docs: record Vercel usage recovery rollout"
```

Commit this step only after the documented production and observation facts have occurred. If the observation is still in progress, leave the document unchanged and report that state rather than inventing a completion record.
