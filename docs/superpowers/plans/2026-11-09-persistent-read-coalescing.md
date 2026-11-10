# Persistent Page Cache Read Coalescing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this approved plan.

**Goal:** Decode one persistent page snapshot once for overlapping same-key callers without changing freshness or refresh semantics.

**Architecture:** A per-key in-flight persistent-read map wraps the existing read helper. Existing origin/repair ownership and forced refresh bypass remain unchanged.

**Spec:** `docs/superpowers/specs/2026-11-09-persistent-read-coalescing-design.md`

## Global constraints

- Preserve held Draft248 security patches, merge/deployment hold and monitoring cadence.
- No live Notion/Redis/provider calls, ingestion, new dependencies or ad-hoc logging.
- Keep strict TypeScript and existing absolute TTL/manual write ownership contracts.

## Review focus

- Same-key promises must not self-join the origin/repair map.
- Failed/missing reads must be released rather than retained as a permanent result.
- A late persistent snapshot must not overwrite a successful manual refresh.
- Independent keys and normalized same-page aliases must behave correctly.
- No completed promise may outlive the cache deadline.

## Tasks

- [x] Add failing real decode-count and lifecycle regressions.
- [x] Implement the minimal separate persistent-read sharing boundary and prove focused tests green.
- [x] Run existing refresh/expiration/grouped-cache suites and the offline before/after profile.
- [x] Run full Node20/22/24 tests, typecheck, lint/guards and fixture build.
- [x] Obtain independent review and prepare the held Draft248 update with evidence and limitations.
