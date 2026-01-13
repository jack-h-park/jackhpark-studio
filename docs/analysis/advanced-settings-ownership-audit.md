# Advanced Settings Ownership Audit

> **Derives from canonical:** [Chat Guardrail System](../architecture/guardrail-system.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

This audit assumes the guardrail contract described in `guardrail-system.md`; it evaluates how the Advanced Settings UX implements those policies without restating them.

**Status:** Draft Analysis
**Date:** 2026-01-03
**Scope:** `components/chat/settings/`, `lib/server/chat-settings.ts`, `lib/server/api/langchain_chat_impl_heavy.ts`

## 1. Executive Summary

The current "Advanced Settings" implementation allows users to override critical runtime parameters (Model, RAG strategies, Token Budgets) via `sessionStorage`. While this empowers expert users, it creates direct conflicts with the system's "Auto RAG" (Self-Correcting Retrieval) capabilities.

**Key Findings:**

1.  **Auto-RAG Conflict:** Enabling "[Reverse RAG](../00-start-here/terminology.md#reverse-rag)" or "[HyDE](../00-start-here/terminology.md#hyde)" in the UI **disables** the automatic quality check logic. The system assumes a user override implies "force this strategy," bypassing the "is retrieval weak?" heuristic.
2.  **Safety Risk:** Users can manipulate `Top K` and `Similarity Thresholds` to values that either degrade quality (garbage context) or spike costs (excessive context window usage).
3.  **Complexity:** The "Preset" system is partially effective but easily broken by granular overrides.

## 2. Verified Guardrail Decisions

The following guardrail invariants from `guardrail-system.md` were verified during the audit:

1.  **[Auto Mode](../00-start-here/terminology.md#auto-mode)** is Sovereign & Explicit:
    - **Invariant:** Strategy execution is decided by `shouldRun = forced || (autoConsider && isWeakRetrieval)`.
    - **[Capability vs Force](../00-start-here/terminology.md#capability-vs-force):** "Enabled" in settings only grants _capability_ (`autoConsider`). It never implies _force_.
    - **Force Flag:** "Force" is exclusively represented by a request-scoped flag (e.g., `ragOverride.mode="deep_search"`). We do **not** use `autoAllowed=false` to represent force, as this conflates intents.

2.  **Weak Lockdown via Key Classification:**
    - Enforcement is done by **Key Classification**, not value comparison.
    - `USER_TUNABLE_KEYS`: Summary level, History budget (Allowed).
    - `PRESET_ONLY_KEYS`: Embedding model, Ranker, Top K, Similarity (Dropped if sent by client).
    - **Transparency:** UI shows effective values (read-only) for preset-managed fields.

3.  **Enforcement:** Server will **Drop + Warn** if client sends any key not in `USER_TUNABLE_KEYS`.

---

## 3. Settings Lifecycle & Precedence

Settings are resolved in the following priority order (highest to lowest):

1.  **Session Config (User Override):** Values stored in browser `sessionStorage` (via `ChatConfigContext`).
    - _Source:_ `components/chat/context/ChatConfigContext.tsx`
2.  **Applied Preset:** Configuration defined in the selected preset (e.g., "Default", "High Recall").
    - _Source:_ `adminConfig.presets[key]`
3.  **Default Policy:** Hardcoded system defaults or environment variables.
    - _Source:_ `lib/server/chat-settings.ts` (`DEFAULT_NUMERIC_SETTINGS`)

**Enforcement:**

- **Server-Side Clamping:** `ChatConfigContext` creates a sanitized config by clamping numeric values to admin-defined limits (`adminConfig.numericLimits`).
- **Feature Gating:** Boolean features (like `allowReverseRAG`) are checked against an `allowlist` before being respected.

## 3. Settings Audit & Ownership Recommendations

We classify settings into four categories to clarify ownership:

- **(A) User Preference:** Safe to change per-session (e.g., Summary Level).
- **(B) Preset Selection:** Users choose a "Mode" (Preset), not raw values.
- **(C) Admin Policy:** Global configuration, hidden from users.
- **(D) System/Auto:** Controlled by runtime heuristics ([Auto-RAG](../00-start-here/terminology.md#auto-rag)).

| Setting             | Type   | Current Behavior            | Runtime Impact        | Risk | Rec.  | Rationale                                                                                                                                              |
| :------------------ | :----- | :-------------------------- | :-------------------- | :--- | :---- | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LLM Model**       | Select | User selects from allowlist | Quality, Cost, Speed  | Med  | **A** | Core preference. Keep user control but obey allowlist.                                                                                                 |
| **Embedding Model** | Select | User selects from allowlist | Retrieval Quality     | High | **C** | **High Context Risk.** Changing embedding model on the fly usually breaks retrieval if the vector store doesn't match. Should be Admin/System managed. |
| **RAG: Top K**      | Slider | User sets count (1-50+)     | Cost, Context Window  | Med  | **B** | Hard to tune manually. Users should choose "High Recall" preset instead.                                                                               |
| **RAG: Similarity** | Slider | User sets 0.0-1.0           | Retrieval Precision   | Med  | **B** | "Magic number" confusing to users. Move to Preset.                                                                                                     |
| **RAG: Reverse**    | Toggle | **Direct Override**         | **Disables [Auto-RAG](../00-start-here/terminology.md#auto-rag)** | High | **D** | **Conflict.** If checked, [Auto-RAG](../00-start-here/terminology.md#auto-rag) logic is bypassed. Should be System-controlled or "Start with Deep Search" action, not persistent setting.          |
| **RAG: HyDE**       | Toggle | **Direct Override**         | **Disables [Auto-RAG](../00-start-here/terminology.md#auto-rag)** | High | **D** | **Conflict.** Same as [Reverse RAG](../00-start-here/terminology.md#reverse-rag).                                                                                                                     |
| **Ranker**          | Select | User selects strategy       | Ranking logic         | Low  | **C** | Technical detail (RRF vs Native). Users unlikely to understand trade-offs.                                                                             |
| **Context Budget**  | Slider | User sets token limit       | Memory/Cost           | High | **C** | Complexity. Should be auto-negotiated by model context window size.                                                                                    |
| **History Budget**  | Slider | User sets token limit       | Chat continuity       | Low  | **A** | Reasonable for users to limit history if distracting.                                                                                                  |
| **Summaries**       | Select | Off/Low/Med/High            | Background LLM calls  | Low  | **A** | Good user preference (reduce background noise/cost).                                                                                                   |
| **Clip Tokens**     | Slider | User sets chunk size        | Ingestion/Context     | Med  | **C** | Technical hyperparameter.                                                                                                                              |

## 4. Auto RAG Conflict Analysis

**Implementation:** `lib/server/api/langchain_chat_impl_heavy.ts` -> `computeRagContextAndCitations`

The conflict arises in `resolveAutoMode`:

```typescript
// lib/server/api/langchain_chat_impl_heavy.ts

function resolveAutoMode(mode: RagAutoMode, baseEnabled: boolean): AutoBaseDecision {
  if (mode === "on") { ... }
  if (mode === "auto") {
    // If user checks the box (baseEnabled = true), autoAllowed becomes FALSE
    return { baseEnabled, autoAllowed: !baseEnabled };
  }
}
```

- **Scenario:** Admin enables "[Auto-RAG](../00-start-here/terminology.md#auto-rag)" to smartly use query rewriting only when necessary (saving latency).
- **User Action:** User checks "[Reverse RAG](../00-start-here/terminology.md#reverse-rag)" in settings because they "want better search."
- **Result:** The "Smart" logic is effectively disabled. The query is _always_ rewritten/reversed, even for simple "Hello" messages (if not caught by guardrails), incurring latency on every turn.

**Recommendation:**

- **UI Change:** Remove persistent "[Reverse RAG](../00-start-here/terminology.md#reverse-rag)" and "[HyDE](../00-start-here/terminology.md#hyde)" toggles from the "Settings" drawer.
- **Replacement:**
  1.  Leave these as **runtime decisions** (System Managed).
  2.  If manual override is needed, allow it as a **"Retry with Deep Search"** action on a specific message, not a global session setting.

## 5. Migration & Enforcement Plan

### Phase 1: Locking Down (Immediate)

1.  **Freeze Admin Config:** Update `admin_chat_config` to remove `allowReverseRAG` and `allowHyde` from the allowlist. This effectively hides the UI toggles.
2.  **Hide Embedding Model:** Remove the selector. Default to the system's active embedding model (essential for stability).

### Phase 2: Presets as First-Class Citizens

1.  **Refactor UI:** Replace numeric sliders (TopK, Similarity) with a simplified "Retrieval Mode" selector:
    - **Balanced (Auto)** - Default
    - **Precision** (High Similarity, Low TopK)
    - **Deep Research** (High TopK, [Auto-RAG](../00-start-here/terminology.md#auto-rag) Aggressive)
2.  **Map Legacy Settings:** If a user has custom `sessionStorage` values, ignore them if they deviate >20% from a known preset, or reset to Default on next load.

### Phase 3: Telemetry

Add a server-side check in `loadChatModelSettings`:

- Compare `sessionConfig` request vs `adminConfig` limits.
- Log `warn` event if user attempts to send "admin-only" parameters (indicating modified client or stale session).
