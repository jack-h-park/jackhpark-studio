# Session Presets

> **Derives from canonical:** [Chat Guardrail System](../canonical/guardrails/guardrail-system.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

The canonical guardrail contract defines which preset shapes are allowed. This page documents the current default preset values implemented in `lib/server/admin-chat-config.ts`.

## Where Preset Values Actually Come From

**Preset values are data, not code.** The live values are the `admin_chat_config` row in the
Supabase `system_settings` table. `DEFAULT_ADMIN_CHAT_PRESETS` in
`lib/server/admin-chat-config.ts` is only the *merge base* underneath it:

```
effective preset = DEFAULT_ADMIN_CHAT_PRESETS  <-  admin_chat_config.presets (per preset key)
```

The merge is per preset key, not per field (`parseAdminChatConfig`): a preset present in the DB
row replaces the code default for that preset **whole**. A preset absent from the DB row falls
through to the code default.

The practical consequence, and the reason this section exists:

> **Editing `DEFAULT_ADMIN_CHAT_PRESETS` does not change production for any preset the DB row
> already defines.** A PR that changes a model there can merge, deploy green, and change
> nothing — silently. This has already caused one wasted round of analysis; see
> [preset-model-migration-review-2026-09.md](../analysis/preset-model-migration-review-2026-09.md).

You can see the override happening without touching the database: the code default for the
Balanced preset is `gpt-4o`, while the running settings UI has shown `gpt-4o-mini`. That
difference *is* the DB row.

**To change a preset value for real,** use the admin dashboard (Chat Config → Session presets),
which upserts the `admin_chat_config` row. Change the code defaults only when you intend to
change the fallback for deployments that have no DB row yet — a fresh environment, or a preset
key the row omits.

## Reading This Page

- The values below are the **repository defaults**, i.e. the merge base — not what any given
  deployment is running. To see what production is running, open the admin dashboard.
- Session-level overrides can change a subset of fields after a preset is applied.
- If code and this page disagree, treat `lib/server/admin-chat-config.ts` as the implementation
  source and update this document. (As of 2026-09 several values below have drifted from the
  code — treat them as illustrative until reconciled.)
- If the admin dashboard and this page disagree, that is expected and is not a bug: the
  dashboard shows effective values, this page shows defaults.

## Balanced (Default)

Balanced is the standard preset for everyday use. It keeps retrieval enabled, uses `gpt-6-luna`, and applies moderate context/history budgets.

- **Additional system prompt:** "Answer concisely and accurately. Avoid speculation. Use retrieved context only when it clearly improves correctness."
- **LLM model:** OpenAI `gpt-6-luna`
- **Embedding model:** default embedding space (`text-embedding-3-small` unless admin config changes it)
- **Require local backend:** false
- **Safe mode:** false
- **Retrieval enabled:** true
- **RAG top K:** 6
- **Similarity threshold:** 0.40
- **[Reverse RAG](../00-start-here/terminology.md#reverse-rag):** false
- **[HyDE](../00-start-here/terminology.md#hyde):** false
- **Reranker:** `none`
- **Summary level:** `low`
- **Context enabled:** true
- **Token budget:** 2048
- **History budget:** 1024
- **Clip tokens:** 128

## Precision

Precision is for correctness-sensitive questions. It uses `gpt-6-luna`, tightens retrieval, and disables summaries by default so the model leans on a narrower context window.

- **Additional system prompt:** "Answer concisely and accurately. Avoid speculation. Use retrieved context only when it clearly improves correctness."
- **LLM model:** OpenAI `gpt-6-luna`
- **Embedding model:** default embedding space (`text-embedding-3-small` unless admin config changes it)
- **Require local backend:** false
- **Safe mode:** false
- **Retrieval enabled:** true
- **RAG top K:** 4
- **Similarity threshold:** 0.55
- **[Reverse RAG](../00-start-here/terminology.md#reverse-rag):** false
- **[HyDE](../00-start-here/terminology.md#hyde):** false
- **Reranker:** `none`
- **Summary level:** `off`
- **Context enabled:** true
- **Token budget:** 2048
- **History budget:** 768
- **Clip tokens:** 128

## High Recall

High Recall is for exploratory or coverage-heavy questions. It uses `gpt-6-luna`, widens retrieval, enables Reverse RAG, and applies MMR reranking.

- **Additional system prompt:** "Prioritize completeness and coverage. It is acceptable to include multiple perspectives or partially relevant context if it improves recall."
- **LLM model:** OpenAI `gpt-6-luna`
- **Embedding model:** default embedding space (`text-embedding-3-small` unless admin config changes it)
- **Require local backend:** false
- **Safe mode:** false
- **Retrieval enabled:** true
- **RAG top K:** 12
- **Similarity threshold:** 0.30
- **[Reverse RAG](../00-start-here/terminology.md#reverse-rag):** true
- **[HyDE](../00-start-here/terminology.md#hyde):** false
- **Reranker:** `mmr`
- **Summary level:** `medium`
- **Context enabled:** true
- **Token budget:** 3072
- **History budget:** 1536
- **Clip tokens:** 256

## Fast

Fast is tuned for lower latency. It uses `gpt-6-luna` and keeps retrieval/context budgets smaller than the other presets.

- **Additional system prompt:** "Focus on speed and brevity. Prefer short, direct answers. Avoid unnecessary explanations or deep reasoning."
- **LLM model:** OpenAI `gpt-6-luna`
- **Embedding model:** default embedding space (`text-embedding-3-small` unless admin config changes it)
- **Require local backend:** false
- **Safe mode:** false
- **Retrieval enabled:** true
- **RAG top K:** 3
- **Similarity threshold:** 0.35
- **[Reverse RAG](../00-start-here/terminology.md#reverse-rag):** false
- **[HyDE](../00-start-here/terminology.md#hyde):** false
- **Reranker:** `none`
- **Summary level:** `low`
- **Context enabled:** true
- **Token budget:** 1536
- **History budget:** 512
- **Clip tokens:** 64

## Override Model

After a preset is applied, the current UI can still override selected fields on a per-session basis:

- LLM model
- summary level
- additional prompt
- retrieval settings when not locked by preset policy
- retrieval enhancements when allowed by the admin allowlist and guardrail policy

Because of that, “active preset” and “current effective settings” are not always the same thing. The drawer marks this condition as a custom override state.

## Preset Escalation Retry

When a knowledge-route response returns with insufficient retrieval context (`context.insufficient === true`), the chat UI shows a **"Retry with [Preset]"** button below the last assistant message. This button re-runs the same question using a higher-recall preset for that single request without permanently changing the session preset.

The escalation map is:

| Current preset | Retry preset |
|---|---|
| Fast | Balanced |
| Balanced | High Recall |
| Precision | High Recall |
| High Recall | _(button hidden — already at max recall)_ |

The retry sends `config: { ...currentConfig, presetId: targetPresetId }` to the API. Because the full preset config is applied, the retry benefits from all of the target preset's parameters (topK, similarity threshold, ranker, context budget) — not just retrieval strategy overrides.

The button is suppressed for chitchat and command routes even though those also produce `insufficient: true`, because those routes intentionally skip retrieval.

## Reasoning Effort

Reasoning effort resolves in one order, implemented by `resolveReasoningEffort()` in
`lib/server/admin-chat-config.ts`:

```
preset.reasoningEffort  ->  generation.reasoningEffort  ->  provider default
```

- **Per-preset** (`presets.<key>.reasoningEffort`, admin dashboard → Session presets →
  *Reasoning Effort*). Leave it on **Inherit** to follow the global setting. Inherit is the
  default for every preset, so nothing changes until you set one.
- **Global** (`generation.reasoningEffort`, admin dashboard → Generation controls). Applies to
  every preset left on Inherit.
- `provider-default` at either level means *send no reasoning parameter at all* — the resolver
  returns `undefined` and the provider factory omits the field.

Two distinctions worth keeping straight:

- **An unset preset override is inheritance, not `none`.** On a reasoning model those behave
  very differently: `none` suppresses reasoning, inheritance may enable it. Never read
  `preset.reasoningEffort` directly; call `resolveReasoningEffort()`.
- **The setting is inert on models that do not support reasoning effort.** The provider factory
  forwards it only when the resolved model declares `supportsReasoningEffort` in
  `lib/shared/models.ts`. The admin UI marks that case with a warning icon rather than hiding
  the control, since the preset may be pointed at a reasoning model later.

The effective value is recorded per request in the telemetry config snapshot as
`reasoningEffort`, so a Langfuse trace shows what the model was actually asked to do — not just
which model ran.

### Why this is per-preset

A single global effort is adequate while every preset shares a model family. It stops being
adequate as soon as presets differ in how much thinking they should do — notably, pointing Fast
at a reasoning model without pinning its effort makes the *speed* preset spend most completion
tokens on reasoning. See
[preset-model-migration-review-2026-09.md](../analysis/preset-model-migration-review-2026-09.md).

## Related Docs

- [guardrail-system.md](../canonical/guardrails/guardrail-system.md)
- [rag-system.md](../canonical/rag/rag-system.md)
- [settings-ownership-audit-local-adapter.md](./settings-ownership-audit-local-adapter.md)
- [preset-model-migration-review-2026-09.md](../analysis/preset-model-migration-review-2026-09.md)
