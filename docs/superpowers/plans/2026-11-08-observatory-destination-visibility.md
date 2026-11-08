# Observatory destination visibility and direct play

Status: locally implemented and browser verified; local/LAN only, public deployment held.

## Goal

Audit all seven destinations on phone and desktop layouts, improving visibility and manipulation without replacing the whole-system portfolio with a decision game. Preserve all three inputs, source-specific receipts, review/Wiki boundaries, optional decisions, direct navigation, reading and native controls.

## Evidence-led plan

- [x] Capture current destination/tool views and test native world picking, dial dragging, press taps and watering hold/release.
- [x] Replace the stale instrument camera offsets (185px + 42% panel reservation) with framing based on the actual visible panel and header geometry. Fit instruments inside the clear play area and verify projection mathematically before applying to the renderer.
- [x] Check short landscape and narrow touch targets. Use a side panel where a bottom sheet leaves too little vertical play space. Keep every close/apply action reachable.
- [x] Add failing geometry/interaction regressions, implement, run focused and full tests, guards/types/lint and optimized build; obtain fresh review.
- [x] Revisit all seven places at mobile and desktop widths. Test direct play at all four instruments, observe their visual changes, inspect three input families and whole-system reading. Retain labeled screenshots and results; do not claim physical-device performance.

## Acceptance

The instrument target and complete animated object fit in an unobstructed play rectangle, with a practical touchable control size. Context sheets do not overlap the target. Both gestures and native controls remain functional; a gesture performs one operation. Navigating or resizing reframes correctly. The main tour remains sources → review → knowledge → writing/explanations/learning, with decisions optional. No real record, Wiki or publication mutation.

## Implementation evidence

- Baseline library dial drag, watering hold/release, and optional judgment dial drag performed one teaching operation each in the current-run mobile UI. Baseline snapshots show the obsolete mobile vertical reservation pushing tools toward the header despite a newly clear lower play area.
- `clearPlayfield`, `framePoint` and `fitObjectFrame` use rendered header/panel bounds and the actual installation's projected Box3. Five viewport classes and all four installations pass corner-containment and centering tests. Short landscape uses a side sheet; map control now has a 44px minimum width.
- Fresh review found automatic panel/header updates could override manual orbit or a captured tool gesture. Added `CameraFramingGate`: layout framing stops after orbit, explicit instrument selection restores it, and captured gestures defer one pending reframe until release. Ownership test observed RED then GREEN.
- Full suite: 683 unit tests and telemetry golden suite pass. Guard checks passed. Final build/browser destination checks still pending.
- Ruling: retain manually selected camera angles until an explicit focus/restore action, even if panel content changes; this avoids surprise camera movement. A visitor can restore framing when wanted.

- Rendered-device audit caught the existing OrbitControls maximum zoom of 4.2 clamping the new framing target. Shared the 0.75–8 zoom limits between the renderer and framing helper, reproduced a projection-centering failure with the old clamp (RED), and verified the shared limit (GREEN). The full 683-test suite passed again. Initial snapshots from the first candidate are superseded where marked.

- Latest mobile UI traversed the six main milestones to completion using direct press taps, provenance-dial drag and watering hold/release, plus native apply buttons. Optional judgment was then operated separately and stopped at the explicit reason/review-trigger handback. Short landscape (568×320) displayed a 250px side panel and an unobstructed left-hand dial that accepted a drag.
- Desktop source audit found the visible plinth was not part of the source hit geometry. Added a non-rendering bounded capsule/plinth volume (radius 0.8, height 1.8), verified RED→GREEN ray tests for all three inputs, and increased compact source framing. Capsule centers remain 2 world units apart. The final 684-test suite passes.

## Final verification

- All seven destinations inspected at mobile and desktop sizes, with labeled screenshots and a seven-row artifact report. Four instruments accepted actual world taps/drags/hold-release on both layouts; native apply paths also exercised. Final desktop watering capture shows tilt, droplets and growth.
- 568×320 judgment dial accepted a horizontal drag with its 250px side panel. 320px source view had no horizontal overflow; project and study plinths selected their own input. Retained source capsules physically relocate to knowledge and remain reselectable through Guide.
- Browser manual-orbit comparison retained the overhead angle after a card update. Overview roundtrip retained the current source progress. Final browser errors empty; viewport reset.
- Final unit count 684, telemetry golden suite, optimized production build/sitemap trace and guard checks passed. Existing unrelated Next plugin/regex/dependency and large /studio page-data warnings remain.
- Local/LAN experience and deck routes return HTTP 200. No public deployment, push, PR or merge. Retain the unmerged local review worktree. Real phone touch/thermal/FPS and owner/comprehension acceptance remain open.
