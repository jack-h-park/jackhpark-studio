# Static Page Verification Scope Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this bounded change with regression tests.

**Goal:** Avoid full sitemap warming for independently verifiable static Pages Router changes, while retaining full coverage for shared code, Notion, ISR and uncertainty.

**Architecture:** Extend the existing verified-deployment-baseline classifier with a conservative TypeScript AST validator. Accept only flat static page routes, literal constants, pure JSX, reviewed Head/config imports and a uniquely owned CSS module. Validate both old and new versions and their reverse runtime dependencies; preserve the existing deck rule, bounded history checks and full fallback. The deployment job installs only a pinned isolated analyzer dependency, not the application dependency graph; installation/loading failure retains full verification.

**Tech Stack:** Node.js ESM, TypeScript 5.9.3 compiler API, node:test, Git snapshots, GitHub Actions.

**Spec:** User-approved scope: changed independent static page plus the six existing canaries; shared code/Notion/ISR/unknown changes retain the entire sitemap. No merge, deployment or monitor cadence changes.

## Global Constraints

- Inspect committed Git objects without evaluating page code or calling Production.
- No application runtime/dependency, monitor cadence or revalidation policy changes.
- Fail closed for unknown imports, lifecycle exports, effects/calls, route deletion/rename, special/dynamic routes, symlinks, shared CSS and invalid metadata.
- Keep manual runs and uncertain deployment history on full verification.

## Review Focus

- Previously dynamic pages must not become exempt merely because the new version is static.
- CSS-only changes must prove the owning page remains static and the module is not shared.
- API/admin/dynamic/special routes and URL traversal must never enter representative plans.
- Analyzer failures must not prevent the full sweep from starting.
- The changed static route and all existing canaries must actually be requested, with broken routes failing the check.

## Task 1: Static route classifier and execution boundary

- [x] Add failing Git fixture tests for pure static page and owned CSS changes, including the actual privacy source.
- [x] Add negative cases for data lifecycle exports, async/calls/hooks, dynamic imports, shared/runtime changes, old dynamic source, shared/global CSS, special routes, deletion and symlinks.
- [x] Implement conservative AST validation in a separate smoke helper and extend the Git diff classifier and plan consumer without widening the deck-only rule.
- [x] Install the pinned analyzer in the deployment job with a full-sweep fallback if unavailable.
- [x] Add loopback-only HTTP tests proving changed routes/canaries are checked without requesting the sitemap, and unsafe plans retain full coverage.
- [x] Run focused tests, relevant lint/type checks and supported Node runtime checks; review the full diff and verify the real #249 diff offline.
- [ ] Commit and prepare a reviewable Draft PR if checks pass; do not merge, deploy or change monitors.
