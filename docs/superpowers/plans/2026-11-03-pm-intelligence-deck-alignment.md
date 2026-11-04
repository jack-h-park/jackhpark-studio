# PM Intelligence deck companion alignment

Status: local observatory alignment and automated verification complete. Reciprocal deck navigation blocked; no publication.

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
- [ ] Add source-owned deck companion navigation and verified scene links; regenerate the local public deck from the current source.
- [ ] Run unit/type/lint/guards and relevant deck checks; independent review, build and restore preview. Record browser verification separately if tool settings still block it.

## Execution ledger

- Public Story v2 deck reviewed directly on 2026-11-03. Current content adds the LLM Wiki foundation, project explanations, career preparation, corrected Vega/Quill roles, Nora and Sera, distinct review points and separate curation. Internal IDs and activity/reducer contracts remain stable.
- Fixed teaching receipts do not automatically update the Wiki, publish anything or revise decision criteria. Jax remains advisory today. Historical answer-example audit dates match the deck's September 10 note.
- General deck links are available in each reading section and non-source destination panel. Ruling: use the absolute public canonical URL because the local generated deck is an older edition. No unsupported scene fragment is emitted.
- Managed source-worktree creation did not respond and was canceled. Artifacts and Git worktree inventory showed no created checkout. Per worktree instructions, no fallback checkout or generated-HTML edit was attempted. Reciprocal navigation, per-scene links and local Story v2 regeneration remain incomplete.
- Full suite passes 673 unit tests and two telemetry golden tests; the final canonical-link regression passes after its expected RED. Type checking, scoped lint, formatting and CSS/path/asset guards pass. Independent read-only review found no actionable content/JSX errors.
- Browser control was unavailable in the preceding verification session. No new UI, physical-device performance, uncoached comprehension, owner acceptance or publication is claimed for these edits.

- Optimized production build and sitemap trace verification pass. Local HTTP response is 200 with Wiki, Explanations, Nora/Sera, corrected Vega role, canonical deck links and noindex intact. Preview restored on loopback port 3037. HTTP checks do not establish browser visual acceptance.
