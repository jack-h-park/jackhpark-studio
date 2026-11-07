# Public API Import Budget Implementation Plan

> **For agentic workers:** Execute inline with a fresh whole-branch review before completion.

**Goal:** Reject invalid chat requests and serve model settings without unrelated telemetry initialization.

**Architecture:** Defer the model-settings boundary until chat validation succeeds; use narrow existing modules for settings and environment resolution.

**Tech Stack:** TypeScript, Node test runner, esbuild execution fixtures; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-06-public-api-import-budget-design.md`

## Global Constraints

- Merge, deployment, monitoring cadence and cache freshness intervals remain on hold.
- Preserve API envelopes, status codes, policy resolution and telemetry contracts.
- All tests and measurements are local, with no Production/provider requests.

## Review Focus

- Invalid methods/bodies must avoid settings module evaluation, not just settings calls.
- Lazy import failure must remain inside the existing HTTP error boundary.
- Valid JSON-string and object requests must preserve configuration and runtime dispatch.
- Public settings coalescing, fresh reads and private-response bypass must remain intact.
- Environment resolution must not require the telemetry SDK or change Preview tagging.

## Tasks

- [x] Extend route execution fixtures with initialization counters and add isolated environment-settings tests; observe failures before implementation.
- [x] Implement narrow imports and validation-before-import without changing policy values.
- [x] Repeat the offline entry-initialization experiment and report its limits.
- [x] Run focused tests, full deterministic suite, typecheck, lint and fixture build validation; obtain fresh whole-branch review.
- [x] Prepare a reviewable isolated branch and record the held Draft PR and cleanup receipts in session artifacts.
