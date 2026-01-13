# Advanced Settings UX Model

> **Derives from canonical:** [Chat Guardrail System](../canonical/guardrails/guardrail-system.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

## Purpose
- Avoid the [Auto-RAG](../00-start-here/terminology.md#auto-rag) conflict space by limiting the knobs that surface to end users.
- Reduce user confusion by emphasizing a preset-first workflow and preventing unstable combinations.
- Keep behavior predictable for support/ops by enforcing a single source of truth for retrieval, memory, and embedding choices.

## Ownership Model

- The canonical guardrail contract (`../canonical/guardrails/guardrail-system.md`) defines which settings are preset-managed versus user-controlled; this section translates those policies into UX groupings.

### Preset-owned (enforced)
- **Embeddings** – the effective model is derived from the preset and surfaced in the “Preset Effects” summary.
- **Retrieval** – Top-K, similarity thresholds, [Reverse RAG](../00-start-here/terminology.md#reverse-rag), [HyDE](../00-start-here/terminology.md#hyde), and ranker behavior can only change via presets.
- **Memory budgets** – context, history, and clip token caps follow the preset definition.
- **Summaries preset defaults** – treated as read-only metadata unless we explicitly expose a safe override.

### User overrides (session-only)
- **LLM model selector** – handle now/next choices while leaving retrieval/memory intact.
- **Summaries frequency** – optional tuning limited to the current session.
- **Session user system prompt** – lets people steer style/formatting without touching preset logic.

### Preview tools (always available)
- **History preview** and **Exact Preview (server)** toggle help users understand how budgets apply.
- These tools read the current session config but do not change enforcement rules.

## UI Principles
- **Avoid disabled knobs** – when something is preset-managed, show the read-only Preset Effects summary instead of a disabled slider/toggle.
- **Single source of truth** – the drawer shows one “Preset Effects (Managed by Preset)” card at the top so users know what drives core behavior.
- **Optional Overrides zone** – the only editable controls live under a dedicated section with impact badges.
- **Custom state** – a “Custom” badge appears next to the preset name and an inline banner alerts users when overrides diverge from a preset.
- **Impact communication** – badges and inline warnings explain that overrides may affect cost, speed, or memory.
- **Reset semantics** – “Reset to Preset Defaults” restores the preset, clears the Custom state, and hides the inline warning.

## Developer Guidelines
- When adding a new setting, decide if it belongs to a preset-owned bucket, a user override, or preview tooling before touching the UI.
- Do not add persistent user overrides for engine/retrieval/memory knobs that are already controlled by presets.
- If the setting affects effective chat behavior, include it in the Preset Effects payload/export so support always sees the current values.
- Tests should cover locked vs unlocked rendering, the `overridesActive` helper, and the safety of the exported payload (no raw prompt text).

## Example
- Start with the **Balanced** preset (retrieval + memory governed by preset).
- The drawer shows a single Preset Effects card and the Optional Overrides section with badges.
- Change the LLM model override:
  1. The **Custom** badge appears beside the preset title.
  2. An “Overrides active” banner shows above the overrides.
  3. A “Reset to Preset Defaults” link/button reverts the session back to the base preset and hides the banner.
