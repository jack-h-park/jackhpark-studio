# Chat Assistant User Guide

> **Derives from canonical:** [Chat Guardrail System](../canonical/guardrails/guardrail-system.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

This guide explains the current chat settings surface as implemented in the Advanced Settings drawer. Preset policy and guardrail semantics remain governed by the canonical guardrail contract.

## 1. Opening Settings

1. Open the chat surface.
2. Click **Advanced Settings** in the chat UI.
3. Changes apply only to the current session unless an admin changes the shared defaults.

## 2. How Settings Are Organized

The drawer is organized around four main controls:

- **Presets:** Fast way to switch between balanced, precision-focused, recall-focused, and speed-focused behavior
- **Model & Engine:** Embedding-space selection when that control is not locked by preset policy
- **Retrieval (RAG):** Retrieval toggle, `topK`, similarity threshold, Reverse RAG, HyDE, and ranker controls when allowed
- **Optional Overrides:** Session-only LLM model override, summary level, and additional prompt text

Some controls may show **Managed by Preset** or **Locked by Preset**. In those cases, the active preset owns that behavior and the field is intentionally not user-editable.

## 3. Presets First

Presets are the primary control surface for most users.

Available presets:

- **Balanced (Default):** General-purpose default with moderate retrieval and low summary frequency
- **Precision:** Tighter retrieval for correctness-sensitive questions
- **High Recall:** Broader retrieval with Reverse RAG enabled and MMR reranking
- **Fast:** Smaller context budgets and `gpt-4o-mini` for lower latency

Preset definitions live in code under `lib/server/admin-chat-config.ts` and the reader-facing values are documented in [session-presets.md](./session-presets.md).

## 4. Model Selection

The chat UI currently supports a filtered allowlist of models defined in `lib/shared/models.ts`. Which options a user actually sees depends on:

- the admin allowlist
- whether local backends are configured
- whether the session is using a preset-managed default or an override

Representative model families:

- **OpenAI cloud models:** `gpt-4o-mini`, `gpt-4o`, `gpt-4.1-small`, `gpt-4.1-medium`, `gpt-3.5-turbo`
- **Gemini cloud models:** `gemini-1.5-flash-lite`, `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash`, `gemini-2.0-pro`, `gemini-2.5-flash-lite`
- **Local models:** Ollama- and LM Studio-backed entries such as `mistral-ollama`, `llama3`, and `mistral-lmstudio`

If a local model does not appear, the most common reason is that the relevant backend is not configured or not currently available.

## 5. Retrieval Controls

When retrieval controls are unlocked, the drawer can expose:

- **Retrieval enabled:** turns RAG on or off for the session
- **Top K:** how many chunks are retrieved before later filtering and context assembly
- **Similarity Threshold:** minimum similarity needed for a chunk to remain eligible
- **Reverse RAG:** enables query-rewrite-oriented retrieval expansion
- **HyDE:** enables hypothetical-answer-based retrieval expansion when allowed
- **Ranker:** chooses the reranking mode, such as `none` or `mmr`

These controls are constrained by the canonical guardrail policy and the admin allowlist. They are not open-ended tuning knobs.

## 6. Summaries and Additional Prompt

The Optional Overrides section currently exposes:

- **LLM Model:** session-only model override when allowed
- **Summaries:** `off`, `low`, `medium`, or `high`
- **Additional Prompt:** session-only prompt text layered on top of the base system prompt

Summary level affects how aggressively older conversation history is compacted. It does not replace the preset; it only overrides that slice of session behavior.

## 7. Safe Mode

**[Safe Mode](../00-start-here/terminology.md#safe-mode)** is a session guardrail mode.

In practice, Safe Mode:

- disables retrieval-driven enhancements
- forces lower-complexity behavior than the normal preset path
- is intended for reliability checks and low-context fallback behavior

For the exact enforcement rules, defer to:

- [guardrail-system.md](../canonical/guardrails/guardrail-system.md)
- [settings-ownership-audit-local-adapter.md](./settings-ownership-audit-local-adapter.md)

## 8. Debugging Surfaces

Admins and debug-capable users may see runtime metadata in the chat surface, including retrieval and enhancement state. Exact debug visibility can vary by route, permissions, and runtime flags, so treat these surfaces as operator aids rather than stable end-user UI.
