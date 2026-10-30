# Deadline Sweep and Redirect Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent deadline-skipped documents from being marked missing and remediate both reported follow-redirects vulnerabilities without releasing.

**Architecture:** Gate the existing sweep using existing processing-completeness evidence. Pin the patched transitive library using pnpm overrides; exercise its real redirect behavior with local servers.

**Tech Stack:** Existing TypeScript/Node tests, pnpm 10.29.3, existing Notion ingestion and synthetic database boundaries.

**Spec:** `docs/superpowers/specs/2026-10-27-deadline-sweep-security-design.md`

## Global Constraints

- Sweep only when full workspace discovery completed and `pagesNotReached === 0`.
- Preserve existing lifecycle accounting, traversal limits, run statuses, retries, retained-cache bounds and cleanup. Do not stamp unprocessed pages as attempted.
- Pin follow-redirects 1.16.1 using pnpm 10.29.3; no unrelated dependency upgrades or new direct production dependency for tests.
- Strict TypeScript, no `any`, English repository documentation/comments, existing telemetry channels only.
- No merge, deployment, monitor-cadence change, paid-tier change, operations-host installation, live provider calls or production database writes.

## Review Focus

1. A few skipped active pages can pass the existing 25% sweep threshold; no retirement is safe when processing was incomplete.
2. An elapsed/configured deadline without skipped candidates must not disable a legitimate completed sweep.
3. Content-hash skips are attempted documents, not incomplete processing.
4. Both array-form credentials and regex-metacharacter custom headers require actual cross-origin stripping; same-origin requests must still work.
5. All transitive resolutions must use the patch, while the default branch and deployed artifacts remain explicitly unremediated until release.

## Task 1: Gate Notion missing sweep on processing completeness

**Files:** Modify `lib/admin/manual-ingestor.ts` and `test/notion-ingestion-fetch-reuse.test.ts`; retain `test/missing-sweep.test.ts` and traversal tests.

**Interfaces:** Preserve `runManualIngestion`, completion-event shape and `pagesNotReached`. Extend the existing synthetic database boundary only as required to observe real sweep selections and status changes. No new exported production helper is necessary.

- [x] Add deterministic regression cases exercising real manual ingestion: a full workspace run visits some pages and deadline-skips at least one active candidate whose fraction is at most 25%; the skipped row stays active, the sweep is never queried, and completion reports skipped processing. Intercept every external transport before importing ingestion; use synthetic configuration only.
- [x] Verify RED before changing the gate; the failure must identify the unsafe sweep/retirement rather than fixture/import issues.
- [x] Add `pagesNotReached === 0` to sweep eligibility and distinguish processing-deadline suppression from incomplete discovery through the existing event channel. Keep all other eligibility checks, lifecycle bookkeeping and cleanup unchanged.
- [x] Cover all skipped, incomplete discovery, partial/selected, hash-skipped attempted pages and a completed full run with a provided/elapsed deadline. A truly missing document may still retire after a complete run. Use controlled clock/events, not flaky real sleeps.
- [x] Run focused ingestion/sweep/traversal suites, scoped lint/formatting, typecheck and the full test suite once before committing. Self-review and commit only owned product/test files. Controller supplies independent review.

## Task 2: Patch both follow-redirects vulnerabilities

**Files:** Modify `package.json`, `pnpm-lock.yaml`; create `test/follow-redirects-security.test.ts`.

**Interfaces:** Use `pnpm.overrides` for exact `follow-redirects: "1.16.1"`; leave unrelated manifest overrides intact. Resolve the installed library through declared dependency ancestry, such as community → IBM SDK → axios → follow-redirects. No hard-coded virtual-store version path or extra production dependency.

- [x] Read official advisory details and installed dependency path. Record the current vulnerable version and audit results, including unrelated advisory/network failures rather than concealing them.
- [x] Write loopback-only behavioral tests using the actual installed library and synthetic credentials. Verify array-form Authorization/Cookie/Proxy-Authorization stripping and custom `sensitiveHeaders` names containing `^`/`|` on cross-origin redirects; verify ordinary headers survive and same-origin protected headers remain. Use separate origins by loopback host alias where required by library semantics, bounded requests, and reliable server/request cleanup.
- [x] Run the new tests against installed 1.16.0 and capture expected behavioral RED without real secrets or external requests.
- [x] Apply the exact pnpm override with `apply_patch`, regenerate the lockfile using pinned pnpm (not broad update/audit-fix), and inspect dependency churn. Stop/report unrelated resolution changes rather than accepting them silently.
- [x] Run the same tests GREEN, frozen-lockfile installation, installed dependency-path/version checks and dependency audit. Confirm no vulnerable follow-redirects resolution remains; default-branch alerts may remain open while merge is held.
- [x] Run scoped lint/formatting, typecheck and the full test suite once before committing. Self-review and commit only owned manifest/lockfile/test files. Controller supplies independent review.

## Task 3: Integrated verification and held Draft PR update

Controller-owned integration, not a second implementation subtask.

- [x] Check the final combined full suite, typecheck, full lint, changed-file formatting and diff checks; reuse exact final source-tree evidence where valid rather than repeating broad runs without a code change.
- [x] Run the CI-only synthetic Notion fixture build; never publish it or fetch live Notion for validation.
- [ ] Obtain one whole-follow-up-range independent review, triage all findings, preserve exact evidence and limitations.
- [x] Before document commit, run portfolio watched-file checks; no no-impact trailer without reading the live section. Keep historical reports unchanged and annotate new evidence separately.
- [ ] Push the held feature branch only, update Draft PR 240 with single-line paragraphs/list items, and verify actual CI/CodeQL; do not dismiss default-branch alerts or enable auto-merge.
- [ ] Preserve recovery patch/remote commits, archive this task's restored worktree through the native tool, and verify removal. Leave unrelated worktrees/primary files untouched.

## Local checkpoint — October 27, 2026

Implementation commits `2a37b48` and `3717ee4` have independent task approvals. The final source tree passed 721 unit tests plus two telemetry goldens, typecheck, full lint (no errors; six existing warnings), authored-file formatting, frozen installation and the synthetic fixture build. The generated pnpm lock retains its pre-existing formatter mismatch and has no unrelated package version/integrity changes; a generated retry-axios peer-key normalization preserves the same axios edge. The two requested advisory IDs are absent from the patched audit; unrelated audit findings remain (including critical/high entries), so the audit as a whole still exits nonzero. Whole-follow-up review and remote CI remain separate gates. No merge, deployment or monitor-cadence change has occurred.
