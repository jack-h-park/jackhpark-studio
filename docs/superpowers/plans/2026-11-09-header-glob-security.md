# Header and Glob Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this approved plan task by task.

**Goal:** Patch the two investigated dependency defects while preserving runtime behavior, old minimatch consumers, and all release/monitoring holds.

**Architecture:** Exact follow-redirects patch override; scoped minimatch major selector; real installed-consumer tests with loopback traffic and offline filesystem fixtures.

## Task 1: Redirect credential protection

- [x] Extend `test/follow-redirects-security.test.ts` with genuine Node VM cross-realm arrays for both header forms and redirect destinations.
- [x] Observe the cross-origin cases fail on installed `1.16.1`.
- [x] Update the override to `1.16.2`, refresh the lockfile, and prove all redirect cases pass.

## Task 2: Scoped glob upgrade

- [x] Characterize actual installed Checkly/glob/ESLint discovery consumers with literal offline fixtures and add bounded amplification coverage that fails on affected versions.
- [x] Override only `minimatch@10` to fixed `11.0.1`; preserve unaffected 3.x and unrelated dependency resolutions.
- [x] Validate consumer compatibility and dependency resolution. Do not run monitoring deployment/test/trigger commands.

## Task 3: Verification and handoff

- [x] Run full tests on Node 20/22/24, typecheck, lint/guards, and a deterministic Next fixture build.
- [x] Obtain an independent whole-branch review and address important findings.
- [x] Prepare a held Draft PR handoff with exact validation and limitations. No merge or deployment.
- [x] Report the Vercel audit's confirmed improvements, intentional costs, and remaining evidence gaps without claiming complete efficiency or measured savings.
