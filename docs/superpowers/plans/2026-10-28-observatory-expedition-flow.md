# Observatory expedition flow

Status: complete for local implementation and browser review. Unpublished; physical-device performance and visitor comprehension remain unverified.

## Scope

Connect the existing source-specific interactions into a suggested expedition: inspect a source, human review, retain knowledge, then writing, questions and learning. Decisions remain optional. Free walking, direct destinations and readable whole-system overview remain available. Fixed cards remain teaching examples, not live outputs or measured outcomes.

## Implementation

1. Derive six milestones and the next incomplete destination from existing reducer receipts. Cover prerequisite order, out-of-order completion, retries, source isolation and reset with executable tests.
2. Replace the coarse footer with source-aware mission guidance. Continue directly from completed instruments; travel first, then offer interaction when the explorer is actually nearby. No timer-based arrival or automatic answers.
3. Add a suggested-route trail along the actual walk graph, next-destination beacon and restrained ambient detail. Respect reduced motion and dispose resources.
4. Verify native controls, three-use continuation and overview access in desktop/mobile browsers. Run relevant tests, guards, type check and production build. Obtain one fresh read-only review and address substantive findings.

## Boundaries

Do not add accounts, achievements, physics, telemetry, dependencies, live agent actions or publication. Keep the active unmerged preview worktree for continued review.

## Execution ledger

- Baseline f560539; clean worktree. Existing scene supports real-position proximity and graph-based travel; use those contracts rather than assumed arrival delays.
- Implemented source-derived milestones, direct completed-tool continuation, arrival-gated mission actions, field-record recap, instanced graph trail and six receipt lamps. Reduced motion fixes the traveler and destination ring in place.
- Independent review identified a no-source proximity bypass in the mission action. Added a failing executable intent regression, then applied one shared intent policy to the actual handler. Direct source selection remains unrestricted by design.
- Ruling: mission travel offers interaction on arrival rather than auto-opening it — this lets visitors see the route, orbit, or walk away without a new overlay taking control. The same actual proximity callback powers walking and the mission prompt.
- Ruling: keep local unmerged worktree and preview for continued owner review; no push, merge, publication or cleanup of active work.
- Final automated checks: 664 unit tests plus two telemetry golden tests; 56 focused PM Intelligence tests; TypeScript, scoped ESLint, CSS/path/asset guards and production build with sitemap trace verification passed. Standalone type check was rerun after the build completed to avoid the generated-type race seen during the first parallel attempt.
- Production browser: no-source travel gating, source/review/knowledge journey, direct 3D press operation, native question controls, completed-tool handoffs and 320px 3D watering reached six milestones with no decision. A 320px inspection found the verbose footer competing with the instrument; compact it to title/progress/action while operating, keeping source context in the instrument.

- Final responsive check: 320×844 and 390×600 both retain 25px between instrument and footer, sticky close remains visible, and document width matches the viewport. Final mobile 3D watering completed out of order and offered the unfinished writing mission. Source switch isolated 0/6 from the original 4/6; reset returned to 0/6. Browser console errors: none.
