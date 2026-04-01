# Settings Ownership Local Adapter

This document is the repo-specific adapter for the canonical playbook `jackhpark-ai-skills/playbooks/settings-ownership-audit.md` and the canonical skill `jackhpark-ai-skills/skills/hybrid/advanced-settings-policy-audit/SKILL.md`.

It intentionally contains only the local vocabulary, ownership mappings, UX semantics, and implementation references needed to apply that method inside `nextjs-react-notion-x`.

## Local Vocabulary

- **Advanced Settings**: the chat settings surface shown in the drawer UI for the current session.
- **Auto-RAG**: the local self-correcting retrieval policy that decides whether advanced retrieval strategies should run.
- **Auto Mode**: the user-facing label that grants capability for automatic retrieval enhancements without forcing execution.
- **Capability vs Force**: local policy distinction between allowing a behavior to run and forcing it to run regardless of runtime judgment.
- **Safe Mode**: the local guardrail mode that disables retrieval and advanced enhancements while enforcing lower budgets.
- **Preset Effects**: the local read-only summary used to show preset-managed values.
- **Custom state**: the local UX state that indicates session overrides have diverged from the applied preset.
- **Request-scoped action**: the preferred local mechanism for one-off stronger retrieval behavior instead of a saved setting.

## Primary Local Entrypoints

- Chat Advanced Settings drawer UI under the chat surface
- Session configuration state and persistence path
- Server-side chat model/settings resolution path
- Runtime guardrail and retrieval decision path

## Primary Local Docs

- [docs/analysis/advanced-settings-ownership-audit.md](../../docs/analysis/advanced-settings-ownership-audit.md)
- [docs/canonical/guardrails/guardrail-system.md](../../docs/canonical/guardrails/guardrail-system.md)
- [docs/chat/session-presets.md](../../docs/chat/session-presets.md)
- [docs/00-start-here/terminology.md](../../docs/00-start-here/terminology.md)

## Repo-Specific Invariants

- UI toggles for advanced retrieval strategies grant capability and must not be treated as persistent force controls.
- Saved session overrides must not disable or bypass the runtime’s automatic retrieval decision logic.
- Safe Mode always disables retrieval and advanced enhancements and applies lower context/history budgets.
- Preset-managed retrieval, memory, and embedding behavior should be shown as managed values rather than freely editable low-level controls.
- Server-side enforcement is authoritative: forbidden or preset-only keys must be dropped, clamped, or ignored even if a client sends them.
- The effective behavior shown in the UI must match the actual enforced state, not only the client-side control state.

## Repo-Specific Exclusions

- Do not treat the current local terminology as shared vocabulary.
- Do not generalize current preset labels or current numeric values into the shared method.
- Do not use this adapter for layout, spacing, border, or admin hierarchy audits.
- Do not use this adapter for telemetry-contract review or retrieval-trace diagnosis.

## Local Setting Classifications

### User Preference

- LLM model selector
- Summaries frequency / summary level
- History budget
- Session user system prompt

### Managed Configuration Selection

- Retrieval mode should be expressed through preset choice rather than raw low-level retrieval tuning

### Policy-Managed Settings

- Embedding model
- Ranker strategy
- Context budget
- Clip token budget
- Similarity threshold
- Raw retrieval count limits

### Runtime-Managed or System-Managed Behavior

- Automatic retrieval enhancement decisions
- Strategy execution that depends on runtime retrieval quality
- Safe Mode enforcement behavior

### Request-Scoped Action

- One-off stronger retrieval behavior should be represented as a per-message or per-request action rather than a saved drawer toggle

## Local Preset / Managed-Config Model

The current managed configuration layer is organized around session presets. The documented preset set is:

- Precision
- Default (Balanced)
- High Recall
- Fast

These presets bundle:

- model choice
- embedding choice
- retrieval enablement
- retrieval depth and threshold behavior
- reranker behavior
- summary level
- context/history budgets
- clip token limits
- Safe Mode state

Users should select among these approved configurations rather than reconstructing them through raw knob-by-knob tuning.

## Local UX Mappings

- Managed retrieval, memory, and embedding values should appear in the local **Preset Effects** summary.
- The drawer should avoid disabled controls when a read-only managed summary is clearer.
- Optional session-only overrides should live in a distinct override zone.
- Divergence from the managed baseline should surface as local **Custom** state plus an override banner.
- Reset should restore preset defaults, clear the Custom state, and remove the override warning state.
- History preview and exact preview tooling are local preview aids; they inform users about budget effects but do not change ownership rules.

## Local Presentation Notes

- Local managed-state wording should continue using **Preset Effects** and **Custom**.
- Session-only overrides should remain grouped separately from preset-managed values.
- Read-only managed settings should prefer summary presentation over disabled low-level controls.
- Show one managed summary card before editable controls so users can identify the source of truth quickly.
- Keep editable controls inside a dedicated overrides zone with impact cues.
- Reset interactions must restore the preset baseline and clear the override state.
- History preview and Exact Preview remain explanatory tools only and must not change ownership or persistence rules.

## Local Implementation References

- `components/chat/settings/`
- `components/chat/context/ChatConfigContext.tsx`
- `lib/server/chat-settings.ts`
- `lib/server/api/langchain_chat_impl_heavy.ts`
- `lib/shared/chat-settings-policy`
