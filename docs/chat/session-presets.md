# Session Presets

> **Derives from canonical:** [Chat Guardrail System](../canonical/guardrails/guardrail-system.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

The canonical guardrail contract defines which preset shapes are allowed. This page documents the current default preset values implemented in `lib/server/admin-chat-config.ts`.

## Reading This Page

- These values describe the repository defaults, not a permanent guarantee for every deployment.
- Admin configuration can override these defaults.
- Session-level overrides can change a subset of fields after a preset is applied.
- If code and this page disagree, treat `lib/server/admin-chat-config.ts` as the implementation source and update this document.

## Balanced (Default)

Balanced is the standard preset for everyday use. It keeps retrieval enabled, uses `gpt-4o`, and applies moderate context/history budgets.

- **Additional system prompt:** "Answer concisely and accurately. Avoid speculation. Use retrieved context only when it clearly improves correctness."
- **LLM model:** OpenAI `gpt-4o`
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

Precision is for correctness-sensitive questions. It tightens retrieval and disables summaries by default so the model leans on a narrower context window.

- **Additional system prompt:** "Answer concisely and accurately. Avoid speculation. Use retrieved context only when it clearly improves correctness."
- **LLM model:** OpenAI `gpt-4o`
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

High Recall is for exploratory or coverage-heavy questions. It widens retrieval, enables Reverse RAG, and applies MMR reranking.

- **Additional system prompt:** "Prioritize completeness and coverage. It is acceptable to include multiple perspectives or partially relevant context if it improves recall."
- **LLM model:** OpenAI `gpt-4o`
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

Fast is tuned for lower latency. It uses `gpt-4o-mini` and keeps retrieval/context budgets smaller than the other presets.

- **Additional system prompt:** "Focus on speed and brevity. Prefer short, direct answers. Avoid unnecessary explanations or deep reasoning."
- **LLM model:** OpenAI `gpt-4o-mini`
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

## Related Docs

- [guardrail-system.md](../canonical/guardrails/guardrail-system.md)
- [rag-system.md](../canonical/rag/rag-system.md)
- [settings-ownership-audit-local-adapter.md](./settings-ownership-audit-local-adapter.md)
