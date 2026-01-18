# Admin Chat Configuration Depth Policy

## Vocabulary
- **L0 → Page shell.** The overall Admin Chat Configuration page frame and top-level navigation chrome.
- **L1 → Section cards.** Each `ai-card` that houses a single configuration surface (Core Behavior, Guardrails, etc.).
- **L2 → Insets/sections.** Nested strips or panels (aka “Section” component) that live inside a card but do not introduce a full chrome layer.
- **L3 → Inline controls.** Labels, inputs, radios, toggles, or chips inside a section.

## Red-flag rules for this surface
1. Avoid stacking `ai-card` (or other full-card surfaces) inside another `ai-card` unless it is explicitly an inset panel meant to feel like an “L2 cascade.”
2. One seam per boundary: a card should own its border/divider and sections inside it should rely on spacing rather than nested borders.
3. Grids or tables that already draw a frame (via `ai-panel`, `GridPanel`, `ai-selectable` borders, etc.) should not be wrapped in an additional framed shell.
4. Tile grids must keep their selected state subtle; do not add extra border/shadow or new chrome just because an item is active.
5. Long textareas/inputs should share consistent max-widths and align their helper copy to avoid ragged edges across the card body.

## PR checklist
- Confirm every top-level card only has one owning border/divider.
- Validate any inset panels (Section components) remain shallow and don’t add competing chrome.
- Ensure tile grids reuse the same spacing and `ai-selectable` styles for focused/selected states.
- Check that dedicated grids/tables (e.g., Numeric Limits, Session Presets) do not get wrapped with another framed panel.
- Align long form fields (including helper text) so their left edges match across the card.
- Re-run `pnpm lint` and `pnpm lint:css-guardrails` to catch CSS-policy violations.
- Update the audit doc with any newly observed violations or confirm “no action.”
- Review screenshots to verify no new double borders or inconsistent padding slipped in.
