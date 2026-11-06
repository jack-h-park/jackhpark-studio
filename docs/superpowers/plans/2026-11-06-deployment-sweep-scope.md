# Deployment Sweep Scope Implementation Plan

> **For agentic workers:** Execute the approved bounded change inline with superpowers:executing-plans; keep release holds intact.

**Goal:** Avoid warming the entire Notion sitemap on verified deck-only deployments.

**Architecture:** A dependency-free GitHub/Git scope resolver emits a validated representative plan only for narrow static changes relative to a successfully verified Production baseline. The existing runner otherwise retains its full sweep.

**Tech Stack:** Node.js ESM, Git, GitHub Actions REST API, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-06-deployment-sweep-scope-design.md`

## Global Constraints

- No merge, deployment, monitor cadence or paid-tier change.
- Unknown metadata or changed files mean full coverage.
- Local tests use temporary repositories and loopback HTTP only.
- No new dependencies or application runtime changes.

## Review Focus

- Skipped deployment commits must remain in the comparison range.
- A failed or skipped baseline verification must not qualify for reduction.
- Rollbacks, same-commit redeploys and stale events require full coverage.
- Renames, deletions, symlinks and malformed plans require full coverage.
- Representative checks must detect a broken changed deck and a broken canary.

## Task 1: Resolver and runner contract

- [x] Write failing Git-history, API-fixture and loopback-runner tests for the Review Focus cases.
- [x] Confirm the new assertions fail before implementing the resolver and plan consumer.
- [x] Implement `scripts/smoke/deployment-sweep-scope.mjs` and extend `sitemap-availability.mjs` without changing its default behavior.
- [x] Run focused tests on available Node versions and resolve failures.

## Task 2: Workflow integration and verification

- [x] Check out the deployed SHA, fetch full history, grant only metadata read permissions and emit the plan before the existing sweep.
- [x] Document the coverage policy and API failure fallback.
- [x] Run the full deterministic test command and relevant formatting, type and path checks; perform a fresh review of the complete diff.
- [x] Prepare a reviewable isolated branch; do not merge, deploy or trigger live sweeps. Record PR and worktree archival receipts in session artifacts.
