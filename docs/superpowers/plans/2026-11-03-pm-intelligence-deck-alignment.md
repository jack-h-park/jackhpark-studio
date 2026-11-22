# PM Intelligence deck companion alignment

Status: local alignment, reciprocal deck navigation and browser verification complete. No publication; physical-device and owner acceptance remain open.

**Goal:** Position the observatory as an experiential companion to the public Story v2 deck, with consistent concepts and reciprocal context links.

**Architecture:** Keep stable internal destination IDs and reducer contracts. Update visitor-facing labels and content to the current published narrative: three inputs, LLM Wiki, viewpoints, explanations, career opportunities/learning and optional decisions. Source-owned deck links must be rendered from the deck's canonical renderer; never hand-edit generated HTML.

## Constraints and decisions

- The deck explains purpose, responsibilities and evidence; the observatory illustrates visitor actions. It does not demonstrate real Agent traffic, automatic curation, output quality or measured learning.
- Preserve direct reading, free travel and the explicit optional decision finish gate.
- Keep generated deck edits reproducible and review local artifacts before release. Preserve the fifteen-slide narrative and legacy/appendix edition boundaries.
- Repository prose is English. Scratch captures/logs stay in the chat artifact directory.

## Steps

- [x] Add regression checks for current concepts, Agent roles, review distinctions and deck context links.
- [x] Align reading and observatory wording, include project explanations alongside answer preparation, and make curation independence explicit.
- [x] Add source-owned deck companion navigation and regenerate the local public deck. Per-scene deep links remain outside this route-level connection.
- [x] Run unit/type/lint/guards, source checks, independent review, build and browser route/control verification.

## Execution ledger

- Public Story v2 deck reviewed directly on 2026-11-03. Current content adds the LLM Wiki foundation, project explanations, career preparation, corrected Vega/Quill roles, Nora and Sera, distinct review points and separate curation. Internal IDs and activity/reducer contracts remain stable.
- Fixed teaching receipts do not automatically update the Wiki, publish anything or revise decision criteria. Jax remains advisory today. Historical answer-example audit dates match the deck's September 10 note.
- General deck links are available in each reading section and non-source destination panel. Ruling: use the absolute public canonical URL because the local generated deck is an older edition. No unsupported scene fragment is emitted.
- Managed source-worktree creation did not respond and was canceled. Artifacts and Git worktree inventory showed no created checkout. Per worktree instructions, no fallback checkout or generated-HTML edit was attempted. Reciprocal navigation, per-scene links and local Story v2 regeneration remain incomplete.
- Full suite passes 673 unit tests and two telemetry golden tests; the final canonical-link regression passes after its expected RED. Type checking, scoped lint, formatting and CSS/path/asset guards pass. Independent read-only review found no actionable content/JSX errors.
- Browser control was unavailable in the preceding verification session. No new UI, physical-device performance, uncoached comprehension, owner acceptance or publication is claimed for these edits.

- Optimized production build and sitemap trace verification pass. Local HTTP response is 200 with Wiki, Explanations, Nora/Sera, corrected Vega role, canonical deck links and noindex intact. Preview restored on loopback port 3037. HTTP checks do not establish browser visual acceptance.

## Connection recovery and final verification

The subsequent source-owned return-navigation pass supersedes the earlier blocked state and absolute-link workaround. The canonical Story v2 publication renderer now adds "Explore in 3D ↗" from source metadata. The local deck is regenerated from that source; observatory links use the same-origin clean deck route again. An exact Next.js beforeFiles rewrite resolves that clean route to the generated index locally.

Source documentation checks pass (1,205 passed, 11 skipped); Studio passes 675 unit tests and two telemetry golden tests, scoped lint/types and optimized build. Browser checks verified both directions, keyboard Enter and existing Next slide navigation at 1280×720, plus route controls at 320×844 and 568×320. Link height is 44px. Source/generated/copied/HTTP-served bytes were checked. No public deployment.

The deck retains a fixed 16:9 presentation on phones, where body text is small; the observatory's Read overview is the responsive reading alternative. Browser viewport checks do not establish physical-device FPS, real touch interruption, comprehension or owner acceptance. Per-scene deck deep links have not been added.
