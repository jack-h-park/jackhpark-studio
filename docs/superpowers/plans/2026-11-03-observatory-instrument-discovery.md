# Observatory instrument discovery

Status: local implementation and automated checks complete; production build verified. Browser interaction and visual acceptance pending.

**Goal:** Make the four physical controls discoverable after a visitor chooses a teaching card, within the approved Signal Observatory direction.

**Architecture:** Reuse reducer progress and exhibit state. A static camera-facing halo at each device's handle appears only for the active, available instrument with a valid armed choice. The halo uses existing pointer routing and generic resource disposal. Native operation buttons and reading remain available.

**Tech stack:** Existing Three.js, React and TypeScript; no new asset or dependency.

## Constraints and rulings

- Preserve the whole-system introduction and optional Product Decision reason/acknowledgment/finish gate. A cue never advances progress.
- Continue the owner's instruction to implement within the selected art direction. Ruling: use a small static interaction overlay instead of new camera motion or a large tutorial; this retains the world and reduced-motion usability.
- Handle markers are presentation overlays, visible over foliage. Limit to two drawable meshes for the one active instrument. No lights, shadows, timers or continuous pulse.
- Preserve source isolation, orbit/drag/pointer ownership, native operation and reading alternatives.

## Steps

- [x] Test that a valid armed card produces readiness, while unconnected, switched, retried and completed records do not. Test visible target pickability only during active readiness.
- [x] Add a static billboard marker at each physical handle; integrate active focus and camera orientation with existing scene updates.
- [x] Show concise selected-card readiness text in the instrument panel; retain native controls.
- [ ] Run tests, lint/types/guards, independent review and optimized build. Inspect actual click/drag/hold flow and a narrow viewport; keep physical-device and comprehension claims separate.

## Verification ledger

- Three new tests first failed for missing readiness/focus behavior and missing native readiness copy, then passed. Expanded lifecycle coverage exercises accepted cards for writing, questions, learning and decisions using the real reducer. Markers clear after operation, source switch, retry and loss of focus; an inactive marker is excluded by actual raycast visibility checks.
- Full suite: 672 unit tests and two telemetry golden tests pass. Focused instruments/exhibits/discovery: 18 tests pass. Type checking, scoped lint and CSS/path/asset guardrails pass. No downloaded asset, dependency or reducer mutation added.
- Independent read-only review found no actionable issues. Markers are static, camera-facing overlays, with two drawable objects visible for the one armed active instrument; existing scene disposal releases their resources.
- Session tooling changed during verification and interrupted the first build. The replacement browser connection explicitly reported that local browser use is disabled in Work settings. No new click/drag/hold or viewport verification is claimed for this candidate. The previous candidate's screenshots are not evidence of this change.
- Field performance, actual touch interruption, uncoached comprehension, owner visual acceptance and publication remain unverified. Existing field-validation protocol still applies.

- Replacement optimized production build and sitemap trace verification pass. Loopback production preview restored on port 3037; HTTP route smoke check is recorded in the artifact manifest.
