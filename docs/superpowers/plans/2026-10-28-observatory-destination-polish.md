# Destination Exhibits Implementation Plan

Status: locally implemented and production-preview verified; continuation of the owner's approved Signal Observatory design and direct local implementation request.

**Goal:** Make knowledge reuse legible through distinct physical exhibits and a visible artifact assembled during each destination activity.

**Architecture:** Keep the existing reducer as the single activity authority. A pure exhibit model derives source-specific slot progress for both an HTML workbench and four Three.js installations. World meshes update only from reducer state, with bounded decorative motion and reduced-motion support. Add shared, merged landscaping along the existing campus edges without obstructing the authored walking graph.

**Tech stack:** Existing React 19, Next.js 15 and Three.js; no dependencies or runtime services.

**Design continuation:** The owner selected Signal Observatory and requested continued visual and destination-game improvements in this session. Retain the existing campus and reading path. Builder's call: choose authored procedural exhibits over replacing the Blender model or introducing more quiz questions; the exhibits connect existing play to spatial feedback and avoid a new asset pipeline. A full world replacement would reset the selected art direction; particles alone would not improve comprehension.

## Constraints and review focus

- Introduce the entire system: three input families, human review, retained knowledge, writing, questions, learning and optional decisions.
- Fixed teaching examples are never represented as actual outputs of a selected source. World growth means exercise progress, not proficiency or real business impact.
- Source changes, retry and reset must clear only the correct exhibit; an unconnected source cannot inherit another source's progress.
- Decisions need a reason, acknowledgment and explicit finish before the completed record appears. No best-choice scoring.
- Keep keyboard/native controls and reading fallback. No drag-only behavior, telemetry, platform writes, external downloads or new lights per prop.
- Preserve existing worktree and preview. No push, merge or deployment.

## Task 1 — Shared artifact model and workbench

Files: `content/pm-intelligence-world/exhibits.ts`, `lib/pm-intelligence-world/observatory-exhibits.ts`, `components/pm-intelligence-world/ObservatoryWorkbench.tsx`, `ObservatoryActivity.tsx`, `Observatory.tsx`, `observatory.module.css`, `test/pm-intelligence-exhibits.test.tsx`.

- [x] Add failing tests for source-isolated slot progress, decision finish gating, retry/reset and all four readable workbenches.
- [x] Define four exhibit identities and derive slot activity from accepted choices, reason and acknowledgment. Show assembled slots, remaining empty slots and selected-input context in the panel, including pending/completed state.
- [x] Offer the next unfinished main use after completion without requiring the optional decision activity.
- [x] Run focused tests and inspect keyboard focus, long content and 320px layout.

## Task 2 — Physical installations and campus detail

Files: `components/pm-intelligence-world/three/observatoryExhibits.ts`, `createObservatory.ts`, `test/pm-intelligence-exhibits.test.tsx`.

- [x] Test that installations expose distinct geometry with bounded mesh/triangle counts and update correctly for partial, finished and reset state.
- [x] Author paper/press, provenance instrument, seedling and judgment record installations outside the walking lanes; provide native landmark access as before. Tag meshes as destination pick targets.
- [x] Add merged lavender, ferns, flower pots, path-edge lights and brass terrace detail at fixed authored locations; reuse materials and geometry. Add no point lights or assets.
- [x] Connect exhibit state changes, selected-source lighting, slow mechanical motion and reduced-motion behavior; reuse existing resource disposal.

## Task 3 — Verification and local handoff

- [x] Run full unit/golden tests, TypeScript, scoped lint, CSS/path/asset guards.
- [x] Obtain independent branch review, fix concrete findings, verify all four activities and retry/source isolation in browser.
- [x] Build production, verify final route and console, capture desktop and mobile, document evidence and local limitations, commit named files.

## Execution record

The six exhibit tests passed after the initial missing-module failure and review-driven regression coverage. Independent source review found no remaining P1/P2 after visibility filtering and planter relocation. Browser testing led to moving the workbench below active controls, compacting its pending slots, and reducing the library light hotspot. No new gameplay state was duplicated outside the reducer.
