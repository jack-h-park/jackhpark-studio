# Admin Chat Configuration Depth Audit

## Top-level cards inventory
- Core Behavior & Base Prompt
- Guardrail Keywords & Fallbacks
- Numeric Limits
- Allowlist
- RAG Document Ranking
- Telemetry & Tracing
- Caching
- Summary Presets
- Session Presets

## Findings

- **Core Behavior & Base Prompt:** No action. Card owns the single seam and the textareas and number input stay within the card body without introducing additional framed shells.
- **Guardrail Keywords & Fallbacks:** No action. The card only uses field stacks and helper text; there are no nested cards/seams to address.
- **Numeric Limits:** No action. Each limit row is a bordered block, but they are tightly scoped to the inner data rows and do not wrap another framed grid, so the card boundary remains the primary seam.
- **Allowlist:** No action. The tile grids already rely on the `AllowlistTile` chrome, which is consistent across models/embeddings/rankers and does not create new card layers.
- **RAG Document Ranking:** No action. The two `GridPanel` halves render their own grid internals but stay contained without an extra surrounding frame.
- **Telemetry & Tracing:** No action.
- **Caching:** No action.
- **Summary Presets:** No action. The internal grid is unframed, so the card border remains the only seam.
- **Session Presets:** No action (mitigated). The retrieval/context `Section` blocks already behave as “inset panels,” and the surrounding `GridPanel` no longer has its own border, keeping the card’s seam singular.
