# Chat Config Allowlist

> **Derives from canonical:** [Chat Guardrail System](../canonical/guardrails/guardrail-system.md)
> This document describes how the allowlist is stored, how it propagates, and where it visibly affects each UI surface.
> If behavior changes, update the canonical doc first, then reflect here.

**Last verified:** 2026-06-08
**Scope:** `types/chat-config.ts`, `lib/server/admin-chat-config.ts`, `lib/shared/model-resolution.ts`, `components/admin/chat-config/`, `components/chat/settings/`, `lib/shared/chat-settings-policy.ts`

---

## 1. What the Allowlist Is

`AdminChatConfig.allowlist` is a server-controlled gate that defines the set of models, rankers, and features that are permitted across the entire application. It is defined in [`types/chat-config.ts`](../../types/chat-config.ts):

```ts
allowlist: {
  llmModels: LlmModelId[];
  embeddingModels: EmbeddingModelId[];
  rankers: RankerId[];
  allowReverseRAG: boolean;
  allowHyde: boolean;
}
```

It is stored as JSON in the `system_settings` PostgreSQL table under the key `"admin_chat_config"`, read via `loadAdminChatConfig()` in [`lib/server/admin-chat-config.ts`](../../lib/server/admin-chat-config.ts), and cached in-memory per process.

---

## 2. Enforcement Layers

The allowlist is enforced at two independent layers, so client-side bypass does not affect server behavior.

### Client — `ChatConfigContext` sanitization

[`components/chat/context/ChatConfigContext.tsx`](../../components/chat/context/ChatConfigContext.tsx) runs `sanitizeNumericConfig()` on every session config change:

- **Models / embedding / ranker** — if the stored value is not in the allowlist array, it is replaced by `allowlist[0]` (the first permitted value).
- **Reverse RAG / HyDE** — if the corresponding boolean flag is `false`, the feature is forced to `false` regardless of what the session config says.

### Server — `resolveLlmModelId()`

[`lib/shared/model-resolution.ts`](../../lib/shared/model-resolution.ts) validates the requested LLM model against `ctx.allowedModelIds` on every chat request. A model not in the allowlist is substituted with the configured default, and the resolution record carries `reason: "NOT_IN_ALLOWLIST"` for observability.

> Embedding model validation currently happens only on the client. Ranker and feature-flag enforcement is also client-only.

---

## 3. UI Impact Map

The allowlist affects two separate screens. The table below documents every place where it changes what an admin or user can see or interact with.

### 3-A. Admin UI — `/admin/chat-config`

This page both **defines** the allowlist and is **constrained by it** in the Session Presets card.

| Location | UI element | Allowlist behavior |
|---|---|---|
| **AllowlistCard** (page header, collapsible "Model & ranker constraints") | LLM model tiles, embedding model grid, ranker tiles, Reverse RAG switch, HyDE switch | Admin edits the allowlist itself here. No restriction — all options are always shown and toggleable. |
| **Session Presets card → LLM Model** | Per-preset model `<Select>` | All models are listed in the dropdown, but models not in `allowlist.llmModels` are rendered `disabled` and cannot be selected. |
| **Session Presets card → Embedding Model** | Per-preset embedding `<Select>` | All embedding spaces are listed, but spaces not in `allowlist.embeddingModels` are rendered `disabled`. |
| **Session Presets card → Retrieval → Reverse RAG** | Per-preset checkbox | Checkbox is always visible. `disabled` when `allowlist.allowReverseRAG === false`. Value is also forced to `false` in the rendered state. |
| **Session Presets card → Retrieval → HyDE** | Per-preset checkbox | Checkbox is always visible. `disabled` when `allowlist.allowHyde === false`. Value is also forced to `false` in the rendered state. |
| **Session Presets card → Retrieval → Ranker** | Per-preset `<Select>` | Only rankers in `allowlist.rankers` are rendered as `<SelectItem>` options. |

Key code references:
- LLM disabled: [`SessionPresetsCard.tsx:592`](../../components/admin/chat-config/SessionPresetsCard.tsx) — `disabled={!optionAllowed || disabledByEnv}`
- Embedding disabled: [`SessionPresetsCard.tsx:639`](../../components/admin/chat-config/SessionPresetsCard.tsx) — `disabled={!config.allowlist.embeddingModels.includes(...)}`
- Reverse RAG / HyDE disabled: [`SessionPresetsCard.tsx:95–96`](../../components/admin/chat-config/SessionPresetsCard.tsx) — `reverseDisabled = ragDisabled || !allowlist.allowReverseRAG`
- Ranker options: [`SessionPresetsCard.tsx:172`](../../components/admin/chat-config/SessionPresetsCard.tsx) — `allowlist.rankers.map(...)`

### 3-B. End User — Advanced Settings Drawer

The drawer is opened from the chat interface. Which sections appear is governed by `USER_TUNABLE_KEYS` in [`lib/shared/chat-settings-policy.ts`](../../lib/shared/chat-settings-policy.ts):

```ts
export const USER_TUNABLE_KEYS = [
  "presetId",
  "llmModel",
  "summaryLevel",
  "additionalSystemPrompt",
];
```

`embeddingModel` and `rag` are not in this list, so `isSettingLocked()` returns `true` for both. The drawer conditionally renders sections based on this:

```tsx
// ChatAdvancedSettingsDrawer.tsx
{!isSettingLocked("embeddingModel") && <SettingsSectionModelEngine ... />}
{!isSettingLocked("rag")            && <SettingsSectionRagRetrieval ... />}
```

| Drawer section | UI element | Visible to user | Allowlist behavior |
|---|---|---|---|
| **Optional Overrides → LLM Model** | LLM model `<Select>` | **Yes** | Only models in `allowlist.llmModels` are rendered as options. |
| Model & Engine → Embedding Model | Embedding `<Select>` | **No** (section hidden by policy) | Code filters by allowlist, but the section is never rendered. |
| RAG Retrieval → Reverse RAG / HyDE | Checkboxes | **No** (section hidden by policy) | Code conditionally renders by allowlist flag, but the section is never rendered. |
| RAG Retrieval → Ranker | `<Select>` | **No** (section hidden by policy) | Code maps `allowlist.rankers`, but the section is never rendered. |

The code for the hidden sections exists and is fully wired to the allowlist — it would become active if `embeddingModel` or `rag` were added to `USER_TUNABLE_KEYS`.

---

## 4. Behavioral Difference: "disabled" vs "filtered"

There are two distinct patterns used across the UIs, and they produce meaningfully different experiences:

| Pattern | Where used | User experience |
|---|---|---|
| **Filtered** — only allowed options are rendered as `<SelectItem>` | End user LLM model picker; Admin ranker dropdown | User sees a shorter list. Disallowed options are invisible. |
| **Disabled** — all options rendered, non-allowed ones get `disabled={true}` | Admin Session Presets → LLM Model; Admin Session Presets → Embedding Model | Admin sees all options, greyed-out items signal that the allowlist is the constraint. |
| **Conditional render** — entire checkbox removed from DOM | End user Reverse RAG / HyDE (when section were visible) | Feature appears not to exist. No indication that it is gated. |

The admin UI intentionally uses "disabled" (not "hidden") so that admins can see the full model landscape and understand what the allowlist is excluding.

---

## 5. Related Files

| File | Role |
|---|---|
| [`types/chat-config.ts`](../../types/chat-config.ts) | `AdminChatConfig.allowlist` type definition |
| [`lib/server/admin-chat-config.ts`](../../lib/server/admin-chat-config.ts) | DB load/save, defaults, parsing |
| [`lib/shared/model-resolution.ts`](../../lib/shared/model-resolution.ts) | Server-side LLM model resolution with allowlist check |
| [`lib/shared/chat-settings-policy.ts`](../../lib/shared/chat-settings-policy.ts) | `USER_TUNABLE_KEYS` — controls which drawer sections render |
| [`components/chat/context/ChatConfigContext.tsx`](../../components/chat/context/ChatConfigContext.tsx) | Client-side sanitization (`sanitizeNumericConfig`) |
| [`components/admin/chat-config/AllowlistCard.tsx`](../../components/admin/chat-config/AllowlistCard.tsx) | Admin edit UI |
| [`components/admin/chat-config/SessionPresetsCard.tsx`](../../components/admin/chat-config/SessionPresetsCard.tsx) | Preset grid constrained by allowlist |
| [`components/chat/settings/ChatAdvancedSettingsDrawer.tsx`](../../components/chat/settings/ChatAdvancedSettingsDrawer.tsx) | End user drawer, conditional section rendering |
| [`components/chat/settings/SettingsSectionOptionalOverrides.tsx`](../../components/chat/settings/SettingsSectionOptionalOverrides.tsx) | End user LLM model picker |
| [`pages/api/admin/chat-config.ts`](../../pages/api/admin/chat-config.ts) | POST endpoint to persist allowlist changes |
