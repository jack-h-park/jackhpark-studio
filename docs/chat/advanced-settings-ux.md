# Advanced Settings UX Local Supplement

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

This document is the repo-local supplement to the canonical playbook `jackhpark-ai-skills/playbooks/settings-ownership-audit.md`.

## Local UX Mappings
- **Preset Effects** is the preferred local label for the read-only managed summary.
- The drawer should show one managed summary card before editable controls.
- The editable area should remain an Optional Overrides zone with impact badges.
- Divergence from the preset should surface as local **Custom** state plus an override banner.
- Reset should restore preset defaults, clear the Custom state, and remove the override warning state.
- History preview and Exact Preview remain local preview tools and must not change ownership rules.

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
