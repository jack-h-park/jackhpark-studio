# Direct Instrument Play Plan

Status: locally implemented and production-preview verified; direct continuation of the owner's selected Signal Observatory and local implementation request.

**Goal:** Operate each physical destination instrument instead of opening another explanation panel, while keeping the whole-system introduction and evidence boundaries.

**Architecture:** Extend the existing source-specific activity reducer with an armed card and an operation counter. A compact native instrument overlay selects the card; either the actual 3D installation or the equivalent native action applies it through the same reducer. A close inspection camera and transient mechanical animations provide immediate spatial feedback. No new dependencies/assets/services.

**Builder decisions:** Keep orbit drag independent of tap activation. Use two-step select/apply instead of accepting a correct answer automatically when a prop is clicked. Keep decision reason/acknowledgment/finish in the existing record panel. Native controls and full reading remain available. Writing presses, questions rotate/link, learning waters, decisions turn a dial; decoration never changes evidence or proficiency.

**Source root:** Existing Studio checkout. **Canonical destinations:** components/pm-intelligence-world, lib/pm-intelligence-world and content/pm-intelligence-world. **Scratch:** session-owned instrument-play artifact package. No publication, merge, push, platform writes or telemetry.

## Tasks

- [x] Test arm/apply semantics: prerequisites, invalid and stale choices, wrong answers, source isolation, retry/reset, decision finish and completed-state protection. Keep legacy PLAY as the existing native reading exercise.
- [x] Implement the reducer and named per-destination operations. Show native card selection, apply, feedback, close/record controls and current input context in the instrument overlay. Return to the record for final decision reasoning.
- [x] Wire physical exhibit clicks into operation mode, frame the actual installation, animate press/dial/watering/turning and highlight hover. Clear transient animation on source switch/reset; respect reduced motion, hidden pick targets and resource disposal.
- [x] Verify keyboard, touch/native equivalence, orbit versus tap, long/narrow layouts and whole-system roundtrip. Run unit/golden/focused tests, type/lint/guards, independent review and production build. Capture browser evidence and commit named files locally.

## Review focus

A world tap must never choose an answer for the visitor or silently complete a product judgment. A card belongs to one source/destination/stage. Opening or closing an overlay does not apply it. The scene cannot move while the instrument overlay owns keyboard input. Input clearing, map travel and return to reading must leave state consistent. Mechanical motion is transient and never a second progress authority.

## Execution record

Direct mode was implemented with source-specific arm/apply actions and transient preview/impulse maps. Browser testing led to ergonomic tool hit volumes, a mobile playfield camera offset and calibrated physical controls. Independent review caught secondary-pointer application and a Restore camera regression; pointer ownership and idempotent null framing corrected them. Nearest source/instrument picking is covered by a real Raycaster regression. Final source review found no remaining P1/P2.

Validation: 658 unit tests, two telemetry golden tests, 50 focused PM Intelligence tests, TypeScript, scoped ESLint, CSS/path/asset guards, production build and sitemap trace checks passed. Final browser verification completed three main uses with real 3D input and native alternatives. The optional decision remained a separate review/finish path. No merge, remote update or publication occurred.
