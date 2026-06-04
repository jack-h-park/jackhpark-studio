# Documentation Improvement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Bring repository documentation back into alignment with the current codebase, reduce onboarding ambiguity, and add lightweight controls that keep docs current.

**Architecture:** Treat documentation as three layers: entrypoint docs, domain docs, and governance checks. Fix reader-facing entrypoints first, then reconcile domain-specific docs with current implementation, then add maintenance rules so drift is detected earlier.

**Tech Stack:** Markdown, Next.js repository docs, `rg`, existing `pnpm check:ai-docs` validation, lightweight shell verification.

---

## Current Status

### What is healthy

- `docs/README.md` clearly separates canonical, operational, and historical documents.
- `docs/00-start-here/repository-map.md` reflects the current repository shape better than the root README.
- `docs/telemetry/README.md` and `docs/operations/README.md` provide usable navigation within their domains.
- `pnpm check:ai-docs` already enforces local binding rules for AI-skill-related docs.

### Primary gaps

1. The root [`readme.md`](../../../../readme.md) is the weakest entrypoint.
   - It contains duplicated narratives.
   - It mixes portfolio overview, setup, and architecture without a clear role boundary.
   - It includes at least one broken local docs link (`./docs/telemetry-logging.md`).
   - It presents stale framing such as “Updated 2025” even though the codebase has moved on.

2. Some high-visibility documents drift from current implementation details.
   - `AGENTS.md` and `CLAUDE.md` frame the stack as “Next.js App Router” and “React 18”, while the repository map and `package.json` show a primarily Pages Router app on Next.js 15 / React 19.
   - `docs/chat/chat-user-guide.md` only describes older Gemini 1.5 choices even though `lib/shared/models.ts` now includes newer Gemini 2.x options.
   - Root setup guidance does not cleanly match `.env.example`, which is the better current source for configuration breadth.

3. Documentation governance is incomplete.
   - The existing docs check validates AI-doc binding rules, not reader-facing correctness.
   - There is no documented owner workflow for updating docs when stack/runtime/model changes land.
   - There is no lightweight broken-link or stale-claims review for the root README and core guides.

## Scope

### In scope

- Root entrypoint docs: `readme.md`, `docs/README.md`, `docs/00-start-here/*`
- High-traffic operational docs: `docs/chat/*`, `docs/operations/*`
- Contributor instructions that shape agent and engineer behavior: `AGENTS.md`, `CLAUDE.md`, `contributing.md`
- Lightweight documentation maintenance checks

### Out of scope

- Rewriting every historical audit or postmortem
- Converting the repository to a new docs platform
- Large content design changes unrelated to accuracy, navigation, or maintainability

## Priorities

### P0: Repair the primary entrypoint

**Outcome:** A new reader can understand what the project is, how it is structured, and where to go next without hitting stale or broken guidance.

**Files:**
- Modify: `readme.md`
- Reference: `docs/README.md`
- Reference: `docs/00-start-here/repository-map.md`
- Reference: `.env.example`
- Reference: `package.json`

**Actions:**
- Replace the duplicated root README narrative with a single clear structure:
  - project overview
  - current stack snapshot
  - quick start
  - repo map
  - links into `docs/`
- Remove or rewrite time-sensitive labels like “Updated 2025”.
- Align setup steps with `.env.example` and current scripts.
- Fix broken links and ensure all local doc references resolve.

**Verification:**
- `rg -n "./docs/telemetry-logging.md|Updated 2025|React 18|App Router" readme.md`
- Manually open every local path linked from `readme.md`.

### P1: Align high-traffic docs with current implementation

**Outcome:** Core docs match the actual stack, runtime, and exposed model/config surfaces.

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/chat/chat-user-guide.md`
- Modify: `docs/chat/session-presets.md`
- Reference: `docs/00-start-here/repository-map.md`
- Reference: `lib/shared/models.ts`
- Reference: `lib/server/admin-chat-config.ts`
- Reference: `types/chat-config.ts`

**Actions:**
- Update project framing to distinguish “primary Pages Router app with limited App Router API usage”.
- Update version-sensitive statements from React 18 / generic App Router language to the current repository reality.
- Reconcile chat/model docs with the active model registry and preset defaults.
- Make session and settings docs explicitly state which source is canonical when UI copy and model allowlists change.

**Verification:**
- `rg -n "React 18|App Router|Gemini 1\\.5" AGENTS.md CLAUDE.md docs/chat`
- Confirm model names and preset defaults against `lib/shared/models.ts` and `lib/server/admin-chat-config.ts`.

### P2: Clarify documentation governance

**Outcome:** Engineers know which doc to update when code changes, and reviewers have a small checklist for preventing drift.

**Files:**
- Modify: `docs/README.md`
- Modify: `contributing.md`
- Create: `docs/00-start-here/documentation-governance.md`

**Actions:**
- Add a short governance doc that defines:
  - entrypoint docs
  - canonical docs
  - operational docs
  - historical docs
  - update expectations when changing stack, env vars, models, routes, or admin UX
- Add a contributor checklist for doc-touching changes.
- Add “update source-of-truth docs first” guidance with concrete examples.

**Verification:**
- Review whether each frequently changed surface has a documented home:
  - stack/runtime
  - environment variables
  - chat model catalog
  - admin workflows
  - telemetry contracts

### P3: Add low-cost automated drift checks

**Outcome:** Obvious documentation regressions are caught before merge.

**Files:**
- Modify: `scripts/check-ai-docs.mjs` or add a separate docs validation script
- Modify: `package.json`
- Modify: `contributing.md`

**Actions:**
- Keep `check:ai-docs` focused on binding rules if desired, but add a second reader-facing docs check for:
  - broken internal markdown links in root docs
  - forbidden stale phrases agreed by the repo
  - required references from root README into `docs/README.md` and `.env.example`
- Wire the new check into local verification guidance and optionally CI.

**Verification:**
- `pnpm check:ai-docs`
- `pnpm <new-doc-check-script>`

## Recommended Execution Order

1. Rewrite `readme.md` as the single cleaned entrypoint.
2. Update `AGENTS.md` and `CLAUDE.md` to stop propagating stack drift.
3. Refresh `docs/chat/*` to match active models, presets, and settings behavior.
4. Add documentation governance guidance.
5. Add an automated reader-facing docs check.

## Success Criteria

- A new contributor can start from `readme.md` and reach the correct detailed docs without dead ends.
- High-traffic docs no longer contradict `package.json`, `.env.example`, or the active model/config code.
- The repo has an explicit rule for where stack, env, model, and operational changes must be documented.
- At least one automated check guards against obvious documentation drift beyond AI-skill binding rules.

## Risks

- Over-updating historical docs will create noise without improving usability.
- Embedding too many version-specific claims in multiple docs will recreate drift quickly.
- Expanding `check:ai-docs` too broadly may blur its purpose; a separate doc-integrity script may be cleaner.

## Suggested Implementation Batch

- Batch 1: `readme.md`, `AGENTS.md`, `CLAUDE.md`
- Batch 2: `docs/chat/chat-user-guide.md`, `docs/chat/session-presets.md`
- Batch 3: `docs/00-start-here/documentation-governance.md`, `docs/README.md`, `contributing.md`
- Batch 4: docs validation script + `package.json`
