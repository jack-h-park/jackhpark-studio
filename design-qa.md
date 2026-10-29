# Signal Observatory — first playable segment review

Status: local implementation review; owner acceptance and publication pending.

## Target and scope

The owner selected the third displayed concept, Signal Observatory. The comparison covers its night-time mountain campus, central knowledge observatory, foreground source terrace and human review desk, four reuse destinations, and the first source-to-knowledge expedition. It does not certify a complete open-world game or equivalence to Bruno Simon's finished portfolio.

The reference is an AI-generated 1487 × 1058 concept. Desktop implementation captures use a 1440 × 1024 CSS viewport at device scale 1. Both images are normalized proportionally to 720 × 512 and placed together for comparison. Narrow reviews use 390 × 844 and 320 × 844 browser viewports; these are not real mobile devices.

## Evidence

Local review package captures: `07-target-comparison.png` records the initial comparison; `08-production-home.png` records the revised full world; `09-production-connected.png` records the completed connection; `10-production-320.png` records the narrow completed state before the spacing correction. `15-final-wide-preview.png` verifies the corrected default viewport, `16-final-matched-desktop.png` and `17-final-target-comparison.png` provide the final matched comparison, and `18-first-segment-comparison.png` compares the foreground source/review area. `11-final-320-connected.png` and `12-final-390-home.png` verify narrow spacing; `13-final-landscape.png` checks essential controls in a short landscape viewport.

Focused review covers the foreground source capsules, review desk, contextual inspection panel, quest controls and destination labels. These are more important than matching the unseen far side of the campus for this first segment.

## Comparison history

- P2: initial illumination washed out materials. Reduced fill/exposure, retained amber windows, and added bounded warm light pools. Revised captures show indigo stone and distinguishable warm windows.
- P2: the world appeared as circular display platforms. Added faceted ledges, connected mountain bedrock, a continuous foundation, foreground conifers and crags, structural window surrounds and gallery rails. Moved the starting camera closer and removed the visible editorial hero so architecture leads the screen.
- P2: narrow destination labels overlapped. Narrow screens now use the labelled compass destination menu; direct source controls remain available.
- P2: the longer completed objective could collide with the narrow inspection panel. Replaced the wrapping quest flex layout with a two-row grid and reserved additional separation above it. Final 320px recapture shows the panel ending at 659px and the quest beginning at 674.4px, with no horizontal overflow.
- P2: focus could fall to the document body after advancing or opening the reading view. Each inspection transition now focuses its heading; entering the reading view focuses the selected section heading; returning restores the expedition action.
- P2: changing reduced-motion preference during a camera tour did not stop that tour. The implementation now snaps and clears the active tour and initializes damping from the initial preference. A separate read-only code review confirmed the correction.

- P2: the closer camera cropped the observatory roof at the default wide viewport. Starting frustum height now has a viewport-aware minimum; the final default-view capture shows the complete roof and its destination label.

## Fidelity surfaces

- Typography: Geist Sans and Geist Mono reuse the existing project identity. Small spatial labels remain distinct from contextual body copy. All essential actions have native button/link equivalents.
- Spacing: the world fills the viewport, with identity and overview at the top and the current objective at the bottom. Inspection is a contextual nonmodal panel, not a permanent text column.
- Colors: UI consumes existing theme roles. Model materials use a coherent indigo stone, brass, cedar, evergreen, cyan-source and amber-window palette. No shared design-system primitives were changed.
- Image quality: world architecture, terrain, props, visitor and source capsules are real geometry. The generated image is a distant sky matte only. The static GLB is merged by material; its deterministic authoring script is included.
- Copy: all three input classes, accumulated knowledge, four uses, eight Agent roles and human judgment remain reachable. Documented examples and illustrative reconstructions remain labelled. Connecting the source is an exercise, not a real platform write or evidence that every reuse destination produced an outcome.

## Functional review

The production route was opened in the in-app browser. A source was selected, inspected, carried to review, acknowledged by keyboard, connected by keyboard, and the four reuse purposes appeared. Clicking the actual 3D observatory also opened its context. Connecting before inspection/review remained blocked. Reading-mode navigation retained the completed expedition; return focus was checked. Reset returned the objective and input receipts to their initial state. Console review found no application errors; a deprecated shadow-map warning was corrected to the current renderer constant.

## Follow-up polish and separate gates

P3: the selected artwork has denser vegetation, more varied surface textures and more detailed character animation than this authored real-time scene. Those remain art-production work; this first-segment review must not be represented as parity with the reference artwork or Bruno Simon's released portfolio. The compass currently provides a destination list rather than the concept's illustrated minimap. Audio remains outside the implemented segment. Free movement was added in the local expansion recorded below.

Real-device frame pacing, thermal behavior, VoiceOver, uncoached visitor comprehension and owner visual acceptance remain unmeasured. Local browser review does not pass those gates. No publication, merge or remote update was performed.

## Final result

final result: passed

This result applies to the first playable segment's directional composition, essential interactions and local responsive usability. It is not a claim of pixel parity, final art-production quality, real-device performance or owner acceptance. All identified P2 interaction/layout issues were corrected and recaptured. Remaining art-density and minimap differences are explicitly recorded above as follow-up work.

## First-segment material and interaction refinement

Status: local refinement review; owner acceptance and publication pending.

The source terrace now has world-scaled limestone paving, engraved capsule plinths, alpine plants and reference crates. The human review desk has an open book, pencil, ink bottle and physical label. Source capsules use brass frames, glass shells and emissive cores. The visitor has a face, hat, backpack, pivoted arms/legs and a carried lantern. Pointer hover highlights actionable scene objects; dragging remains orbit input.

The albedo is an AI-generated source image embedded into the GLB. Local night-scene review found its paving readable at the first-segment camera distance; this does not certify seamless tiling at every possible zoom. The original generated image remains a draft artifact. The canonical compressed source is `scripts/assets/observatory/limestone-albedo.jpg`.

A code review identified texture and ImageBitmap retention when leaving the world. Scene cleanup now deduplicates geometry, materials and textures, disposes them and closes owned ImageBitmaps, including models that finish loading after teardown. The foreground props share materials and merge frame beams to limit extra draw calls.

The 320px completed state has no horizontal overflow. Keyboard review and knowledge connection passed, and returning from the complete HTML introduction preserves the expedition and restores action focus. Refinement captures are `refinement/01-source-closeup.png` and `refinement/02-mobile-completed.png`; production captures are recorded in the local artifact manifest.

The model contains 54,552 static triangles, 21 materials and one embedded albedo. Optional model and sky assets total 4,116,370 bytes, below the 8 MiB asset budget. These are asset statistics, not measured real-device frame-pacing results. The earlier remaining gates and fidelity limits still apply.

Refinement verification: all 21 targeted PM Intelligence tests passed, along with TypeScript, scoped ESLint, CSS/path guards, asset hashes and the production build with sitemap trace checks. The build logged existing Notion collection 403 responses and an unrelated `/studio` payload warning. The production route returned HTTP 200 and retained noindex. Actual capsule picking reported the external-signal target and pointer cursor; orbit dragging did not change selection.

## Free exploration and destination activities

Status: locally implemented; owner acceptance, real-device testing and publication pending.

The explorer now walks with WASD/arrows or a touch direction pad on a bounded graph of terraces, stairs and bridges. Input is camera-relative, diagonal speed is normalized and elapsed time is capped. A proximity hint and E/native interaction open the nearest destination. Existing click travel and destination menus remain available. Movement pauses while inspecting a panel/menu; input is cleared on blur, hidden documents, pointer cancellation and reset. Reduced motion preserves direct walking while disabling camera follow and decorative animation. The world can be refocused with a native control.

Writing assembles observation, interpretation and a bounded claim. PM questions reconstruct a source-to-answer preparation chain. Learning orders demand, study and reviewed practice. Optional decisions accept several judgments but require a reason and acknowledgment of the remaining uncertainty before completion. Each activity has explanatory feedback, retry and a local record; completion is represented by a warm destination beacon. The main progress counts three reuse activities and explicitly keeps decisions optional.

Activities are fixed illustrative teaching examples, not artifacts generated from the selected source. They unlock only for the current inspected/reviewed/connected input and keep independent source-specific receipts. This browser session completed all four, rejected an unsupported claim, preserved progress through the complete HTML introduction, rejected a different unconnected source and reset the expedition. A 320px browser viewport showed the activity panel and touch controls without horizontal overflow. Touch-style held direction input moved the explorer and released; WASD and E were also exercised. This is browser viewport testing, not a physical mobile-device result.

Fresh code review found a same-location travel request bug after free walking. A travel revision now makes repeated destination/source requests route from the actual current position. The Review approach avoids the crate; a bounded-step test reaches every destination. Activity prompt/result focus and sticky dismissal remain available inside long scrolling panels.

Evidence lives in the local free-exploration artifact package: `01-three-uses-completed.jpg`, `02-mobile-decision.jpg` and `03-mobile-walking.jpg`. The complete system reading path, all three input classes, four uses, Agent preparation, human judgment and evidence limits remain intact. No new dependencies, runtime asset downloads, platform writes or telemetry were added.

Final expansion validation: 640 unit tests and two telemetry golden tests passed. TypeScript, scoped ESLint, CSS/path guards, unchanged asset hashes and the production build/sitemap trace checks passed. Independent final code review found no remaining P1/P2. Browser verification and local preview are separate from real-device performance, owner acceptance and publication.

Final play-panel polish places the prompt and choices before the expandable activity brief. The greenhouse connector is two merged meshes with raycast-tested footing; pavilion wall blockers and arrival points keep walking outside the building interiors.

## Campus wayfinding

Status: locally implemented; real-device performance, visitor comprehension, owner acceptance and publication remain separate gates.

The compass now opens a north-up schematic of the actual walking graph, with seven native destination buttons, explicit numbered labels, a separate live explorer ring and source-specific activity checks. The open map samples a position ref at five updates per second; its timer stops when closed or the document is hidden. The selected destination is not presented as the explorer's position. This replaces the earlier destination-only list; it is a schematic rather than the concept's illustrated minimap.

The map heading receives focus on opening. Its native sticky close button returns focus to the compass, and keyboard destination selection opens the matching context heading. Bounded scrolling placement keeps the heading, dismissal and all destinations reachable on narrow and short screens. Browser checks covered 320×844, 390×600, 390×700, 1000×600 and 844×414. All map buttons have 44×44 CSS-pixel targets. These checks do not establish physical-device or assistive-technology acceptance.

Closing a panel no longer clears a click-travel route merely because walking mode becomes unpaused. Entering manual walking or actual directional movement can still interrupt travel. The full HTML introduction and all system uses remain available; Product Decision remains optional. No new assets, dependencies, telemetry or platform writes were introduced.

Validation: 643 unit tests, two telemetry golden tests and 35 focused PM Intelligence tests passed, with TypeScript, scoped ESLint, CSS/path guards and unchanged asset hashes. Independent review identified short/narrow clipping; both placement cases were corrected and checked in the browser. Production build and final local capture are recorded in the wayfinding artifact manifest.
