# Observatory Free Exploration Implementation Plan

Status: implemented locally; production build and browser verification passed; owner acceptance and publication pending.

**Goal:** Introduce the entire PM Intelligence System through walking, source review, shared knowledge and four distinct reuse activities.

**Architecture:** Extend the existing Three.js world with a tested walkable campus graph and bounded camera-relative movement. Keep click travel and native destination controls. Store source-specific activity receipts in the existing reducer; render native activity controls in a focused panel and reflect completion in the 3D world.

**Tech Stack:** Existing React, TypeScript, Three.js and node:test; no new dependencies or platform calls.

**Spec:** This document records the implementation decisions for the owner's explicit in-session request, extending the selected Signal Observatory direction.

## Design decisions

- Use WASD/arrows and a touch direction pad to walk along terraces, stairs and bridges. Avoid cliffs, buildings and authored props. Pause movement while a panel/menu is open or focus is in another control; clear input on blur, visibility change and cancel.
- Keep all destinations accessible by click. E or a native Interact button opens the nearby location; proximity never steals keyboard focus. Movement remains available with reduced motion while camera follow and decorative animation stop.
- Writing builds observation → interpretation → bounded claim. PM questions reconstruct a traceable answer chain. Learning orders demand → study → practice. Optional decisions require a chosen next step, a reason and retained uncertainty.
- Activities use illustrative reconstructions, require a connected source, retain input-specific receipts, allow retry and explain mistaken choices. They do not call real agents or claim outputs, skill gains or real decisions.
- Whole-system HTML, eight Agent roles, original evidence labels and noindex remain intact. No push, PR, merge or deployment.

## Global constraints

English repository text; route-local changes; no new dependencies, live platform calls or telemetry. All simulation output is illustrative. Product decisions remain optional.

## Review focus

- Held input on blur, panel opening or touch cancellation must stop.
- Long steps and diagonal input must not cross cliffs or accelerate diagonally.
- Travel after interrupted movement starts from the actual actor position.
- A different source must not inherit activity receipts or bypass human review.
- Keyboard and 320px touch users can access all interactions without moving.

## Tasks

- [x] Add navigation tests for boundaries, stairs, diagonal speed, shortest paths and every destination; observe failures, then implement navigation helpers.
- [x] Add activity tests for prerequisites, wrong/repeated choices, all four completions, source isolation and reset; observe failures, then extend the reducer and activity content.
- [x] Connect movement, input cleanup, proximity, click routing, camera and completion beacons to the scene. Add native/touch controls and per-destination activity UI.
- [x] Run focused tests, type/lint/asset/CSS/path checks, browser keyboard/touch/responsive flows and production build. Obtain a fresh code review, fix material findings, commit named files and retain the active local preview.

## Execution ledger

Ruling: The owner explicitly requested direct implementation of these named features in this session; preserve the chosen visual direction and settle reversible interaction details here without another design-selection round.

Ruling: Use a monotonically increasing travel request for MOVE/SELECT, including the same place. Free walking changes the actor independently of the content location; repeated clicks must still route back.

Review: a fresh code review identified that same-place travel issue; fixed and regression-tested. Review endpoint and approach were moved around the physical reference crate, and a bounded-step test now reaches every authored destination. Writing/question/learning completions plus the optional reason-and-uncertainty decision record passed browser review. Activities preserve focus on their next prompt or result, including decision completion.

Ruling: Free walking exposed a gap beside the greenhouse. Add a two-mesh connector with merged planks/rails, verify footing by raycast, and block pavilion interiors while placing arrival points outside the walls. All destinations remain reachable by bounded walking steps.

Validation: 640 unit tests, two telemetry golden tests, TypeScript, scoped ESLint, CSS/path guards, asset validation and production build passed. Production source→review→knowledge→writing activity and WASD movement passed in browser; console had no errors. Real devices, owner acceptance and publication remain separate.
