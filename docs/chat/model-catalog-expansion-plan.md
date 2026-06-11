# Model Catalog Expansion Plan — Anthropic + Newer OpenAI/Gemini

> **Related:** [Chat Config Allowlist](./chat-config-allowlist.md) — the allowlist renders this catalog; no UI work is needed because the admin surface auto-populates from `LLM_MODEL_DEFINITIONS`.

**Status:** Implemented and verified (Phases 1–5), including live Anthropic round-trip.
**Authored:** 2026-06-10
**Scope:** `lib/shared/models.ts`, `lib/shared/model-provider.ts`, `lib/core/model-provider.ts`, `lib/server/api/llm-provider-factory.ts`, `lib/server/settings/model-settings.ts`, `types/chat-config.ts`, `package.json`

---

## 1. Motivation

The admin allowlist (`/admin/chat-config`) only exposes an aging catalog (gpt-3.5-turbo, gpt-4o-era, Gemini 1.5/2.0) and has **no Anthropic provider at all**. The allowlist UI is not the problem — it renders whatever `LLM_MODEL_DEFINITIONS` contains via a pull-up chain (catalog → types → provider → factory → UI). The fix lives in the catalog + provider layer.

Goals:
1. Add Anthropic (Claude) as a first-class provider with current models.
2. Register newer OpenAI and Gemini models.
3. Demote stale models to a non-destructive `deprecated` state.

---

## 2. Provider Wiring (the pull-up chain)

| Layer | File | What changes |
|---|---|---|
| Provider type | `lib/shared/model-provider.ts` | Add `"anthropic"` to `ModelProvider`, `BASE_MODEL_PROVIDERS`, `MODEL_PROVIDER_LABELS`, `PROVIDER_ALIASES` |
| API key config | `lib/core/model-provider.ts` | Add `anthropic` to `PROVIDER_KEY_CONFIG` (`ANTHROPIC_API_KEY`) |
| Engine type | `types/chat-config.ts` | Add `"anthropic"` to `ChatEngineType` |
| Factory | `lib/server/api/llm-provider-factory.ts` | Add `case "anthropic"` using `ChatAnthropic` (dynamic import) |
| Engine mapping | `lib/server/settings/model-settings.ts` | Map `provider === "anthropic"` → `"anthropic"` in both resolution sites (else it falls through to `"unknown"`) |
| Dependency | `package.json` | Add `@langchain/anthropic` |

OpenAI and Gemini already have provider wiring — they only need new catalog entries.

---

## 3. Catalog Additions (`LLM_MODEL_DEFINITIONS`)

| Provider | Display name | `id` / `model` (API string) | Sampling (`temperature`) |
|---|---|---|---|
| anthropic | Anthropic Claude Opus 4.8 | `claude-opus-4-8` | **Not sent** |
| anthropic | Anthropic Claude Sonnet 4.6 | `claude-sonnet-4-6` | Sent |
| anthropic | Anthropic Claude Haiku 4.5 | `claude-haiku-4-5` | Sent |
| gemini | Gemini 3.5 Flash | `gemini-3.5-flash` | Sent |
| gemini | Gemini 2.5 Flash | `gemini-2.5-flash` | Sent |
| openai | OpenAI gpt-4.1 | `gpt-4.1` | Sent |
| openai | OpenAI gpt-4.1-mini | `gpt-4.1-mini` | Sent |
| openai | OpenAI gpt-5-4-mini | `gpt-5-4-mini` | Sent |
| openai | OpenAI gpt-5-4 | `gpt-5-4` | Sent |
| openai | OpenAI gpt-5-5 | `gpt-5-5` | Sent |

Notes:
- The `model` field is sent verbatim to the provider API. OpenAI entries use **bare** strings (no `openai/` gateway prefix) because the factory calls `api.openai.com` directly with no custom `baseURL`.
- `gemini-2.5-flash` is distinct from the existing `gemini-2.5-flash-lite`; both coexist.

---

## 4. Sampling-Parameter Invariant (the one real gotcha)

Anthropic removed `temperature` / `top_p` / `top_k` on **Opus 4.8 (and 4.7, Fable 5)** — sending any of them returns HTTP 400. Sonnet 4.6 and Haiku 4.5 still accept `temperature`.

The factory currently passes `temperature` unconditionally, so adding Opus 4.8 naively would 400 on every call. Resolution:

1. Add an optional `supportsSampling?: boolean` field to `LlmModelDefinition` (default treated as `true`).
2. Set `supportsSampling: false` only on Opus 4.8 (and any future 4.7/Fable entry).
3. In the factory's `anthropic` case, omit `temperature` from the `ChatAnthropic` constructor when `supportsSampling === false`.

This is a model-*class* flag ("rejects sampling params"), not a one-off Opus exception — it generalizes to every future thinking-only Anthropic model.

---

## 5. Deprecating Stale Models (non-destructive)

Rather than deleting entries (which risks orphaning preset/allowlist defaults), add an optional `deprecated?: boolean` to `LlmModelDefinition`. Deprecated models stay resolvable but are visually de-emphasized in the admin UI.

**Marked `deprecated: true`:** `gpt-3.5-turbo`, `gemini-1.5-flash-lite`, `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash`, `gemini-2.0-pro`.

**Retained as-is:** `gpt-4o`, `gpt-4o-mini` (preset default), `gpt-4.1-small`, `gpt-4.1-medium`, `gemini-2.5-flash-lite`, local models (Llama3 / Mistral).

**Preset defaults are unchanged** — `DEFAULT_ADMIN_CHAT_PRESETS` keeps `gpt-4o` / `gpt-4o-mini`, neither of which is in the deprecated set, so no default needs to move.

---

## 6. Phased Execution

1. **Phase 1 — Provider layer.** `anthropic` in `ModelProvider`, labels, aliases, `PROVIDER_KEY_CONFIG`, `ChatEngineType`.
2. **Phase 2 — Factory + sampling flag.** Install `@langchain/anthropic`; add the `anthropic` factory case + engine mapping; add `supportsSampling` and the conditional-`temperature` branch.
3. **Phase 3 — Catalog.** Register the 10 new entries from §3.
4. **Phase 4 — Deprecation.** Add `deprecated` flag, mark the §5 set, surface it in the admin tile.
5. **Phase 5 — Verify.** ESLint on changed files, `tsc`, admin-preview smoke test (allowlist shows the new cards; one Claude chat round-trips).

---

## 7. Verification Checklist

- [x] `tsc --noEmit` and ESLint clean on all changed files.
- [x] Allowlist renders new Anthropic / OpenAI / Gemini cards (verified in `/admin/chat-config` preview); deprecated models show a `LEGACY` badge + muted tile and remain selectable.
- [x] `gpt-4o` / `gpt-4o-mini` still resolve and stay selected (preset defaults unchanged).
- [x] No browser console errors on the admin page.
- [x] Factory omits `temperature` when `supportsSampling === false` (code path; `@langchain/anthropic@1.4.0` only auto-strips for `opus-4-7`, so 4.8 is handled in our factory).
- [x] **Runtime (with `ANTHROPIC_API_KEY` set):** verified via `scripts/smoke/smoke-anthropic-models.ts` — Opus 4.8 instantiates with `temperature` omitted and round-trips (no sampling-param 400); Sonnet 4.6 / Haiku 4.5 carry `temperature=0.2` and both `invoke` + `stream` return "ok".
