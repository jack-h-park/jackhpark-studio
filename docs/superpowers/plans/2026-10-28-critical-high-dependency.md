# Critical and High Dependency Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patch the five named advisory IDs using compatible dependency updates without releasing.

**Architecture:** Serialized dependency patches, real installed-library regressions, independent reviews and integrated offline verification. Preserve the existing load-reduction candidate.

**Tech Stack:** Strict TypeScript, existing Node/tsx tests, jsdom, pnpm 10.29.3, Next 15.5.

**Spec:** `docs/superpowers/specs/2026-10-28-critical-high-dependency-design.md`

## Global Constraints

- Exact targeted versions: Next 15.5.28, DOMPurify 3.4.17, `zod@4` 4.6.6; retain Sharp 0.35.5 and the existing follow-redirects 1.16.1 override.
- Use pnpm 10.29.3 and the pinned Node 24 runner. No unrelated package upgrades, new direct dependencies or telemetry streams.
- Strict TypeScript, no `any`, English docs/comments, no private machine paths in the public repository.
- No merge, deployment, monitoring-cadence change, paid change, live provider/database call, real credential/config read or live exploit/OOM probe.
- Keep embedded PostHog copies, bundled Zod v3, unbounded collections, existing peer mismatches and unresolved audit findings explicit; do not claim global or deployed remediation.

## Review Focus

1. Actual Next Sharp resolution, not only the root dependency, must retain the official mitigation.
2. Synthetic DOM tests must fail on the vulnerable behavior rather than execute an event handler or network request; normal string/iframe rendering remains compatible.
3. Zod early bounds must reject before element traversal while valid, boundary and in-range invalid inputs keep expected behavior.
4. Shared peer snapshots and Vercel's exact-pinned Zod copy must actually move without forcing a different major on consumers.
5. Version audit success does not prove vendor assets, v3 compatibility exports, production deployment or historical CPU causation.

## Task 1: Patch Next and pin the image mitigation invariant

**Files:** Modify `package.json`, `pnpm-lock.yaml`; create `test/next-dependency-security.test.ts`.

**Interfaces:** Preserve existing image configuration and delivery helpers. Resolve Sharp from Next's actual module context with createRequire, without hard-coded virtual-store paths. Tests import no application provider or credentials.

- [x] Add a dependency regression that asserts installed Next is 15.5.28 and its resolved Sharp is 0.35.5; retain ordinary image proxy/delivery tests. Run it before the manifest change; capture the expected Next version RED, not an exploit.
- [x] Set the direct Next dependency exactly to 15.5.28 using apply_patch, regenerate the lock using pinned pnpm, inspect only the Next closure and account for every additional normalization. Stop/report unrelated version/integrity changes.
- [x] Run frozen installation, the new invariant and existing `test/next-image-proxy.test.ts` / `test/notion-image-delivery.test.ts`; capture GREEN. Save installed ancestry/version output and audit evidence for both Next advisory IDs removed; unrelated findings remain expected.
- [x] Run scoped lint/formatting, typecheck and full `pnpm test` once before commit. Name any failing test or baseline warning; do not hide failures. Commit only owned manifest/lock/test files and write self-review plus commands/exit statuses to the supplied artifact report. Controller supplies independent review.

## Task 2: Patch DOMPurify and the Zod v4 graph with behavioral regressions

**Files:** Modify `package.json`, `pnpm-lock.yaml`; create `test/dependency-sanitizer-validation-security.test.ts` (or split into two focused test files if this materially improves readability; report the exact paths).

**Interfaces:** Consume Task 1's patched manifest/lock. Load DOMPurify via PostHog's declared resolution context and jsdom already in the project; load Zod through actual Anthropic and Vercel Functions → OIDC → CLI-config ancestry, plus the production LangChain SDK context. No new direct dependency or hard-coded store path.

- [x] Write small real-library regressions before patching: DOMPurify SAFE_FOR_TEMPLATES on split inert template text in a shadow root, and IN_PLACE hook detaching an ancestor/sibling with an inert handler attribute. Assert removal/neutralization without executing strings or scripts; jsdom must not run scripts or load resources. Preserve normal string/iframe HTML compatibility using PostHog's exact existing sanitizer options. Capture behavioral RED on 3.4.16.
- [x] Test Zod v4 bounded array parsing using three invalid elements and max(2), counting actual element callbacks. Patched behavior must reject with one size issue and zero element visits. Include valid two-element, in-range invalid, exact-length, tiny set/map controls and an unbounded-container control proving the patch is not a universal limit. Capture behavioral RED on both current affected copies without large payloads or timing assertions.
- [x] Set the existing DOMPurify override to 3.4.17 and add only `zod@4: 4.6.6`; retain Task 1's Next/Sharp/follow-redirects changes. Regenerate with pinned pnpm and inspect all package versions/integrities, accepting only target closure and explained peer-key normalization. Never replace a v3 consumer's major through a bare `zod` override.
- [x] Run frozen installation and the same regressions GREEN. Verify actual PostHog/Anthropic/CLI-config/LangChain resolutions, all standalone Zod copies and unchanged embedded vendor/v3 boundaries. Offline smoke SDK JSON-schema conversion/parse and CLI-config pure scalar schema validation with synthetic values only. Do not read real auth files or call providers. Retain any existing Stagehand peer mismatch explicitly.
- [x] Re-run audit: all five named advisory IDs must be absent; preserve remaining/adventitious findings and metadata. Run scoped lint/formatting, typecheck and full `pnpm test` once before committing owned files. Retain raw RED/GREEN/static/audit receipts, self-review and exact command exit statuses. Controller supplies independent review.

## Task 3: Integrated verification, held PR evidence and cleanup

Controller-owned integration, not a second implementation task.

- [x] Reuse the exact final source-tree full-suite receipt where valid; run full lint, authored-file formatting/diff checks, synthetic fixture build from the existing CI workflow, fresh post-build typecheck and action-map count inspection. Never print action encryption keys or deploy the fixture build.
- [ ] Obtain a final independent whole-follow-up review from c0c7252; triage findings and evidence limits.
- [x] Run staged portfolio-watched checks before committing new docs. No Portfolio-Impact trailer without live-page review; historical reports stay unchanged.
- [ ] Update the existing Draft PR 240 feature branch only after verifying its head; no force push, merge, auto-merge or deployment. Record actual remote CI/CodeQL and ignored Preview status. Use one physical line per PR paragraph/list item.
- [ ] Preserve recovery patch, remote head and artifacts, then native-archive only this task's managed checkout after verifying it is clean and unused. Leave other worktrees and unmerged remote branches untouched; report a native ownership refusal instead of bypassing it.

## Local checkpoint — October 28, 2026

Implementation commits `e2095a0` and `169a7b8` passed independent task reviews. The final product tree passed 745 unit tests plus two telemetry goldens, frozen installation, full lint (zero errors, six existing warnings), authored-file formatting, synthetic fixture build and fresh post-build typecheck. The fresh action manifest has zero node and edge entries. Full audit retains four moderate/four low findings, with zero critical/high; production-only audit separately retains two low. All five named IDs are absent, and the same DOMPurify patch also removes one low advisory. Embedded vendor copies, bundled Zod v3/unbounded traversal, existing peer mismatches and deployed/runtime uncertainty remain explicit. Whole-follow-up review, actual remote checks and cleanup are separate gates, not release authorization.
