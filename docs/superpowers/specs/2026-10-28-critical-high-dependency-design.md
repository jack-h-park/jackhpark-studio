# Critical and High Dependency Remediation Design

The owner approved the minimal same-major patch design on October 28, 2026, with Subagent-driven execution. The starting candidate is held Draft PR 240 at `c0c7252`. Approval does not authorize merge, deployment, monitoring-cadence changes or paid actions.

## Intent and scope

Remove the affected dependency resolutions behind two critical and four high audit findings while preserving application behavior. There are five unique advisory IDs: the Zod advisory occurs on two dependency paths. This is preventive dependency remediation, not proof of historical exploitation or CPU attribution.

## Approach and alternatives

Use exact targeted versions: Next 15.5.28, the existing DOMPurify override at 3.4.17, and a major-scoped `zod@4` override at 4.6.6. Retain Sharp 0.35.5 and existing unrelated dependency versions. A broad latest-version upgrade increases compatibility risk unnecessarily; dismissing package findings based only on absent current preconditions would leave future callers exposed. Neither alternative is selected.

Serialize shared manifest/lockfile changes. Use the pinned pnpm 10.29.3, not ambient pnpm 11, which ignores this repository's package.json override policy. Run installed-library regression tests with small synthetic inputs and compatibility controls; do not test RCE, OOM or live production endpoints. Do not introduce a new production dependency for testing.

## Exposure and residual boundaries

- [Next image advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw): the candidate enables public image optimization, but Next already resolves Sharp 0.35.5, satisfying the official workaround. Keep that invariant while moving Next out of the affected range.
- [Next Server Actions advisory](https://github.com/advisories/GHSA-p3m5-59mp-jv5r): inspected source has only App Router GET handlers and no Server Actions. Do not change route architecture; inspect a fresh fixture build's action-map counts without printing secrets.
- [DOMPurify shadow-root advisory](https://github.com/advisories/GHSA-cg2g-xh64-v4q7) and [detached-hook advisory](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr): inspected PostHog wrappers do not enable the required modes/hooks. Patch the audited dependency anyway. Prebuilt PostHog bundles embed a separate 3.3.2 copy; an override does not rewrite those bundles or remotely served scripts. No all-copy or live-remediation claim, feature shutdown or PostHog upgrade is included.
- [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): installed 4.1.11 and 4.3.6 reproduce the bounded-collection traversal issue with three elements. No current public exploit path was established. The upstream patch short-circuits eligible bounded v4 collections; unbounded containers and bundled `zod/v3` are not fixed by it. Preserve v3 consumers, record Stagehand's existing peer mismatch, and do not force a bare Zod-major override.

## Acceptance and delivery

Both target dependency paths and shared v4 peers resolve patched versions; the five named advisory IDs disappear from a fresh audit. Preserve all unrelated audit findings and disclose additional findings rather than claim global security clearance. Narrow lockfile closure changes and generated peer-key normalization must be accounted for; unrelated upgrades require a separate decision.

Each implementation task receives independent spec/quality review. Final verification includes frozen installation, full tests, lint, typecheck, authored-file formatting, synthetic fixture build and whole-follow-up review. Update only the existing held Draft PR with evidence after all tasks; no auto-merge or deployment. Preserve a recovery diff, remote commits and verification artifacts before native task-worktree cleanup. Do not bypass another checkout's ownership protection.
