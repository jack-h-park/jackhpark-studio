# Repository Map

This document is a current orientation map for the repository. It is not a canonical contract. When behavior, policy, or terminology matters, prefer the linked canonical and architecture documents.

## High-Level Surface

- The application is primarily Pages Router, with a small App Router API surface under `app/api/internal/...`.
- Main operational API and admin paths live under `pages/api/` and `pages/admin/`.
- Chat requests enter through [`pages/api/chat.ts`](../../pages/api/chat.ts), which resolves runtime settings and delegates to [`pages/api/langchain_chat.ts`](../../pages/api/langchain_chat.ts).
- `langchain_chat.ts` is a lightweight wrapper. The heavier LangChain/RAG runtime is loaded through `lib/server/api/langchain_chat_entry.ts`, `langchain_chat_impl.ts`, and `langchain_chat_impl_heavy.ts`. See [`docs/architecture/langchain-chat-architecture.md`](../architecture/langchain-chat-architecture.md).
- Most chat policy and runtime setting resolution lives in [`lib/server/chat-settings.ts`](../../lib/server/chat-settings.ts).

## Admin Surface

- Admin pages live under `pages/admin/`.
- Shared admin UI components live under `components/admin/`.
- A representative entry point is [`pages/admin/ingestion.tsx`](../../pages/admin/ingestion.tsx), which assembles manual ingestion, snapshot preview, RAG document overview, lifecycle summary, system health, and recent-run surfaces.
- Chat configuration admin UI is split between [`pages/admin/chat-config.tsx`](../../pages/admin/chat-config.tsx), `components/admin/chat-config/`, and [`lib/server/admin-chat-config.ts`](../../lib/server/admin-chat-config.ts).
- All admin pages are wrapped by `components/admin/layout/AdminPageShell.tsx`, which applies the J·P design system theme (`data-theme="jp"`) and loads Geist font via `next/font/google`.
- The admin top nav includes a theme toggle (J·P ↔ Legacy). Theme preference is managed by `hooks/use-admin-theme.ts` and persisted in `localStorage('admin-theme')`.

## Chat Settings UX

- Chat settings UI lives under `components/chat/settings/`.
- The main advanced settings drawer is [`components/chat/settings/ChatAdvancedSettingsDrawer.tsx`](../../components/chat/settings/ChatAdvancedSettingsDrawer.tsx).
- Guardrail and ownership behavior should be checked against [`docs/canonical/guardrails/guardrail-system.md`](../canonical/guardrails/guardrail-system.md) and [`docs/chat/settings-ownership-audit-local-adapter.md`](../chat/settings-ownership-audit-local-adapter.md).

## Core Domains

Core implementation domains are separated across `lib/`:

- `lib/rag/`: ingestion, metadata, retrieval helpers, and document lifecycle
- `lib/server/`: server-side chat, guardrails, model resolution, telemetry, and API internals
- `lib/server/langchain/`: LangChain retrieval and answer chains
- `lib/server/api/`: lightweight-to-heavy chat API loading layers
- `lib/telemetry/` and `lib/server/telemetry/`: Langfuse/PostHog metadata and trace helpers
- `lib/logging/`: repo logging infrastructure
- `lib/local-llm/`: Ollama and LM Studio local model clients
- `lib/admin/`: admin data normalization and query helpers
- `lib/chat/`: chat UI/runtime helper logic
- `lib/notion/`: Notion-specific page and property helpers
- `lib/core/` and `lib/shared/`: provider, model, embedding, and shared configuration primitives

## Design System

Two themes coexist. See [`docs/canonical/design-system/ai-design-system.md`](../canonical/design-system/ai-design-system.md) §0 for full details.

| Theme | Scope | Applied via |
|---|---|---|
| **J·P** (JHP Studio v1.1) | Admin + Chat UI | `data-theme="jp"` on root elements |
| **Notion** (legacy `--ai-*`) | Public Notion pages | default; no attribute needed |

Key design system files:
- `styles/jp-theme.css` — `[data-theme="jp"]` token definitions + component overrides (J·P Lab surface). This is a theme token file; color literals are intentional and it is excluded from `featureCssFiles` in `scripts/check-css-guardrails.mjs`.
- `styles/ai-design-system.css` — shared `--ai-*` primitives and shared brand tokens (`--brand-*`, `--gradient-*`) in `:root`. Primitive-only per `css-guardrails` contract.
- `styles/notion-brand.css` — Notion page brand overrides (gradient link hover)
- `hooks/use-admin-theme.ts` — admin theme toggle hook

## react-notion-x Fork Workflow

See [`docs/operations/react-notion-x-deployment.md`](../operations/react-notion-x-deployment.md) for full details.

Quick reference:
- **Dev with fork locally:** `pnpm deps:use-local` → `pnpm install`
- **Release fork + switch to remote:** `pnpm deps:release` (auto-increments `7.7.1-jp.N`)
- **One-time hook setup:** `pnpm setup-hooks` (installs pre-push guard)

The pre-push hook (`scripts/hooks/pre-push`) blocks accidental pushes while in local-link mode.

## Notion API & Sitemap

- Sitemap generation lives in `lib/get-site-map.ts`. It uses `getAllPagesInSpace` from `notion-utils` to walk the workspace.
- The `getPage` callback passed to `getAllPagesInSpace` **must stay lightweight** — `fetchCollections: true` only. Do **not** substitute the full `loadPageFromNotion` from `lib/notion.ts`; doing so multiplies API calls 5–10× per page and exhausts the unofficial Notion API rate limit on every server start. See [`docs/incidents/notion-429-sitemap-rate-limit-2026-06.md`](../incidents/notion-429-sitemap-rate-limit-2026-06.md).
- Sitemap results are disk-cached in `.next/cache/notion-sitemap.json` (5 min TTL in dev, 60 min in prod) to survive server restarts without re-fetching.
- Full page loads (`lib/notion.ts → loadPageFromNotion`) include a 429 retry with exponential backoff (2 s, 4 s).

## Operationally Important Areas

- Docs under `docs/` are used as repo policy and operational guidance, not just notes. Start with [`docs/README.md`](../README.md) for the role of each folder.
- DB assets currently live under `db/`, especially `db/schema/` and `db/migrations/`. `supabase/sql/` exists as an adjacent SQL area.
- Smoke and QA scripts are first-class operational tools:
  - `pnpm smoke:chat`
  - `pnpm smoke:langchain-chat`
  - `pnpm smoke:admin-ui`
  - `pnpm qa:notion-polish`
  - `pnpm check:katex` for optional live Notion content audits
  - `pnpm lint:css-guardrails`
- Repo-local skill bindings live in `ai/skill-wrappers/`. Canonical shared skills and playbooks are referenced through the sibling `jackhpark-ai-skills` path as an external shared library; do not document local copies as source-of-truth skill material.

## Stack Signals

From `package.json`, the current stack includes:

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- LangChain
- Langfuse
- PostHog
- Supabase
- `react-notion-x`

The project is still rooted in a Notion starter kit lineage, but it has been heavily specialized into a chat/RAG/admin platform.
