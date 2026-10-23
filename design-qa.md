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

P3: the selected artwork has denser vegetation, more varied surface textures and more detailed character animation than this authored real-time scene. Those remain art-production work; this first-segment review must not be represented as parity with the reference artwork or Bruno Simon's released portfolio. The compass currently provides a destination list rather than the concept's illustrated minimap. Audio and free movement are not part of this segment.

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
