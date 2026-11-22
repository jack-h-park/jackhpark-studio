# Observatory readiness review

Status: complete for local implementation and browser inspection. Physical-device performance, participant comprehension and owner acceptance remain unverified.

## Goal and bounds

Preserve the selected Signal Observatory design and the whole-system story. Reduce verified redundant drawing work without changing the routes, colors or gameplay. Make the first mission explain the purpose before a source is selected. Prepare a concrete field-test record without inventing participant or device results.

## Steps

1. Capture the current entry and source/review/knowledge flow. Record visible comprehension risks and explicit audit limits.
2. Extract the existing cyan connection dots into one instanced draw. Test all instance positions against the original route computation, appearance/material attributes, aggregate bounds and resource disposal.
3. Clarify initial mission guidance using existing footer space, while retaining normal arrival prompts after selection and unrestricted reading/navigation. No new modal or mandatory tutorial.
4. Run unit/focused tests, type/lint/guards, independent read-only review, production build and desktop/mobile browser checks. Retain local preview; no push, merge, deployment or live platform changes.
5. Add a short device/visitor protocol and blank results sheet. All unrun field gates stay unverified.

## Ledger

- Baseline 4013f7a; clean tree. Preview server was no longer running; restored the existing production preview at loopback 3037.
- Chrome DevTools MCP is unavailable. Ruling: stop trace-based audit, continue source-owned batching and UI review; make no measured FPS or Core Web Vitals claims.
- Implemented 203 original cyan route points in one instanced mesh, preserving the baseline route algorithm and material. Regression checks every instance position, aggregate bounds, material settings and instance disposal.
- Clarified the initial footer with the complete source/review/knowledge/reuse chain; selected-source arrival prompts remain unchanged.
- Added a physical-device and five-person formative protocol with a blank `not_run` CSV template. No device or participant results were entered.
- Independent static review found no substantive blocker. Transparent instance sorting is a visual comparison caveat; do not claim pixel identity. Existing scene teardown already disposes instanced mesh buffers.
- Automated verification: 665 unit + two telemetry golden tests, 57 focused tests, TypeScript, scoped ESLint, CSS/path/asset guards and production build/sitemap trace verification passed.
- Mobile audit found a 28px mission action and source buttons partly covered by the footer. Raised the action to 44px and separated source/map/context placement from the mission footer.
- Independent CSS follow-up caught a negative viewport-based inspection cap at 568×320. Replaced it with a containing-world cap plus a 180px usable floor; native inspection/scroll/action/close passed in that viewport. At 320×844 the entry action is 44px with sources ending at 604px and footer beginning at 638px; at 390×600 context ends at 370px and footer starts at 410px. These are browser geometry checks, not device acceptance.
- Saved background-tab screenshots sometimes omitted UI text. Ruling: archive those as limited world references and exclude them from UI acceptance; use current-tab captures plus native DOM geometry for the final report.

- Final production smoke: 320×844 action 44px, source/footer gap 34px; 568×320 context 180px with native inspect/close; overview accessible before completion and receipts retained on return. No browser console errors. Final preview retained at loopback 3037.
