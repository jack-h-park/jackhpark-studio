# Observatory clear-stage implementation

Status: locally implemented and verified; local and previously authorized LAN preview only. Public deployment held.

## Scope and design

The user reports that an unexplained historical article title appears to be the Signal terrace's purpose, and that concurrent overlays obscure the 3D interaction. Keep whole-system scope and source provenance while reducing persistent chrome. The existing 3D scene and teaching receipts remain the product, with overview/deck reading available independently.

Approaches: shrinking all existing panels leaves competing messages; hiding every control sacrifices discovery and access. Use one compact mission action plus an explicit Guide, mutually exclusive contextual surfaces, and a smaller card chooser that folds after a choice. This is a scoped correction to the existing interface, under the standing inline implementation instruction.

## Tasks

- [x] Reproduce current inspection density in a saved screenshot and verify the title's source.
- [x] Add failing UI tests for unobstructed initial state, explicit guide/source selection, single contextual surface, and article provenance below a generic task heading.
- [x] Move sources/progress/help to the Guide, replace the persistent quest card with compact navigation, hide competing chrome while a context/map/tool is open, preserve dismissal and focus.
- [x] Fold instrument card choices after arming; keep apply, 3D manipulation and accessible reading alternative available. Bound phone panel height and keep the canvas visible.
- [x] Run scoped tests, complete unit suite, TypeScript/lint/format/guards and optimized build. Review changes independently.
- [x] Verify desktop and narrow-screen source → review → knowledge → 3D instrument flow and deck return. Refresh local/LAN previews without public deployment.

## Acceptance and evidence

Initial exploration has no source chooser or explanatory side panel; only small edge controls. At most one guide/context/map/tool surface is visible. On a phone, contextual panels occupy at most about 40% of the viewport and scroll internally. Instrument choices fold after a card is selected. All three input families, optional decisions, review/knowledge boundaries and source-linked historical title remain reachable. Record before/after screenshots; physical-device acceptance remains open.

## Results and review

- Full Studio test suite: 680 unit tests and telemetry golden suite passed. TypeScript, scoped ESLint/Prettier, CSS/path/asset guards and optimized production build/sitemap trace passed. Existing Next lint-plugin, unrelated unsafe-regex and dependency deprecation warnings remain.
- Fresh review found focus loss when selected card controls fold, and a newly hidden map opener preventing synchronous focus return. Card focus regression was reproduced RED and fixed with post-commit focus to apply/selected card. The new map-opener hiding was removed, preserving its established close/focus behavior; browser verified focus returns to Explore the system.
- Browser flow: source selection → inspect/limits → human review → retained knowledge → writing instrument. A direct click on the highlighted 3D handle advanced the accepted teaching card from stage 1 to 2. Reading overview and back retained the 3/6 expedition state.
- At 545×893, one source inspection panel is 294.71px high, mission dock hidden. At 390×844, the armed instrument is 320.72px high with one panel visible. At 320px all persistent controls stay within bounds. Desktop 1280×800 and restored default view inspected. Browser error log empty.
- All three sources, documented-example title/provenance, human review and Wiki/publication limits remain reachable; product decisions remain optional. No article or canonical deck copy changed.
- Local 3037 and owner-authorized LAN 3038 production previews refreshed; both experience and deck routes return 200. No public deployment, push, PR or merge. Physical-device acceptance, comprehension and art acceptance remain open.
- Ruling: retain the small map opener while its map is open rather than hiding its DOM element; this preserves focus restoration and does not add a second content panel.
