# PM Intelligence Observatory field validation

Status: ready to run; all physical-device and uncoached-visitor results are unverified.

This protocol tests the whole-system introduction, not skill at completing a game. Source-derived progress, optional Product Decision and direct reading are part of the product contract. Local unit tests and viewport screenshots do not pass the field gates below.

## Freeze the candidate

Record the commit, exact preview URL, build mode and date. Use a production build. Keep a copy of the candidate's source and screenshots. A localhost URL works only on the host machine; do not give it to remote participants as though it were a share link. Arrange an owner-operated device test or a separately authorized reachable preview before recruiting. Publication, tunneling, network exposure and participant contact require their own authorization.

## Physical-device session

Use one actual laptop, one recent iPhone/Safari and one midrange Android/Chrome; record exact hardware, OS, browser, screen size, battery/power mode and network conditions. These are coverage classes, not a claim that specific devices are available. Test the default motion setting and reduced motion. Start each cold-load run with a clean cache, then repeat once warm; do not average the two conditions together.

1. Open the frozen candidate and record time until the world and native controls are usable. If it fails, use Read overview and verify the full system remains understandable.
2. Walk, orbit and zoom for 60 seconds. Record a native profiler trace, median frame rate, 95th-percentile frame interval and visible stalls. Test again after connecting a source, with all four cyan routes visible. Save actual traces; do not infer FPS from the number of meshes.
3. Inspect a source, review its limits and connect it. Follow the suggested trail, operate each of the three main instruments, then return to the field record. Repeat once using native buttons instead of physical instrument gestures.
4. On a touch device, press/hold/release watering, drag a dial horizontally, drag outside the tool to orbit, add/remove a second finger and interrupt a gesture by switching apps. Returning must not leave a stuck control, apply an extra card or complete an unanswered step.
5. Open/close the map and inspection with keyboard or touch. Check focus return, sticky close controls, scroll reachability and text enlargement. Read overview and return; source receipts must survive this roundtrip. Switch source and retry/reset to check isolation.
6. Hide the page for 30 seconds and return. Check responsiveness and the profiler for hidden-page rendering work. Repeat the route for ten minutes; record crashes, lost WebGL context, unusual heat, stalls and any memory trend as observations rather than a diagnosis.

Proposed project acceptance targets below are for this experience; they are not industry thresholds or results:

| Gate | Target | Current field status |
| --- | --- | --- |
| Usable world on agreed test network | Cold run <= 8 seconds; record conditions and failures separately | Unverified |
| Sustained laptop motion, 60-second trace | Median >= 50 FPS; p95 frame interval <= 33 ms | Unverified |
| Sustained mobile motion, 60-second trace | Median >= 30 FPS; p95 frame interval <= 50 ms | Unverified |
| Interaction continuity | No unintended operation, stuck gesture, lost receipt or unreachable close control | Unverified |
| Reading fallback | Whole-system introduction usable without finishing the game | Unverified on physical devices |
| Reduced motion | No automatic traveling light or pulsing ring; essential controls remain usable | Unverified on physical devices |
| Stability | No crash/context loss during the ten-minute session | Unverified |

If a gate fails, record the failing state and device, fix it, and rerun that condition plus the source/review/knowledge smoke flow. Do not broaden a passing viewport check into a device claim.

## Uncoached visitor session

Recruit five people unfamiliar with this project, including at least two people who assess PM portfolios. Use anonymous IDs and record their device/browser, not their names or private work. Ask permission before recording; written notes are enough. Do not contact or recruit anyone automatically.

1. Show the initial screen for 30 seconds without explaining the concept. Ask: "What do you think this system is for?" Record the answer verbatim and the first action they choose. Do not tell them that it is an AI system or a decision tool.
2. Give the task: "Explore enough to explain how something becomes useful knowledge here. You can use any route." Observe for up to three minutes. Log wrong turns, requests for help and whether the next mission is found without a hint. Game completion is not required.
3. Ask the six questions below without teaching the expected answers. Score only after the session.
4. Ask them to show a non-decision use and return to the full introduction. Ask which detail they would inspect to judge the credibility of a portfolio claim.
5. Collect one confusing moment and one useful moment. Keep dislike of the art style separate from misunderstanding the system.

| Question | One-point evidence |
| --- | --- |
| What is the system for? | Connects/reuses product knowledge across work; not described solely as a decision quiz |
| Where does knowledge come from? | Names at least two of external signals, project experience, market sensing/study |
| What happens before reuse? | Mentions inspection/interpretation, human review and retained source/context |
| Where might knowledge be reused? | Names at least two of writing, PM questions and learning; decisions may be additional |
| What is the person's role? | Agents prepare; a person reviews, revises or owns judgment |
| What did the demo establish? | Fixed teaching examples/traceable reuse, not proven quality improvement, mastery or live Agent output |

Formative acceptance: at least four of five participants score >= 4/6 and correctly explain the whole-system purpose, human role and demo limits. At least four of five find the next mission or reading route without a facilitator hint. Any repeated misconception that the system exists only for Product Decision requires copy/flow revision even if the total score passes. This small study guides iteration; it is not statistical evidence of audience-wide comprehension.

## Record and report

Use the adjacent [results template](pm-intelligence-field-results.csv). Copy it for each candidate; retain the blank template. Use `not_run`, `pass`, `fail` or `blocked`, with evidence paths and concise observations. Empty metrics mean unmeasured, never zero. Do not put participant identities or raw private browser logs in this public repository. Keep session evidence in the task artifact area and commit only sanitized findings.

Report source validation, local browser inspection, physical-device performance, uncoached comprehension and owner visual acceptance separately. A release decision belongs to the owner after reviewing the evidence.
