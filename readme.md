# Jack H. Park Portfolio Platform

Production-oriented personal portfolio platform built on top of the `nextjs-notion-starter-kit` lineage and extended with RAG ingestion, admin tooling, and configurable chat runtimes.

## What This Repo Is

- Public portfolio site rendered from Notion content via `react-notion-x`
- Admin surfaces for document ingestion, chat configuration, and RAG inspection
- Chat stack with configurable retrieval, guardrails, telemetry, and optional local LLM backends
- Interview-facing codebase optimized for clarity, explainability, and operational visibility

## Current Stack

- Next.js 15
- React 19
- Primarily Pages Router, with a small App Router API surface under `app/api/internal/...`
- TypeScript
- Tailwind CSS plus repo design-token contracts
- Supabase + pgvector
- LangChain plus custom RAG/runtime code
- Langfuse and PostHog telemetry

For a more precise repository map, start with [docs/00-start-here/repository-map.md](./docs/00-start-here/repository-map.md).

## Quick Start

1. Install dependencies.

```bash
pnpm install
```

2. Copy the example environment file and fill in the required values.

```bash
cp .env.example .env.local
```

At minimum, configure:

- `NOTION_ROOT_PAGE_ID`
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional local-model settings such as `LOCAL_LLM_BACKEND`, `OLLAMA_BASE_URL`, and `LMSTUDIO_BASE_URL` are documented inline in [.env.example](./.env.example).

3. Run the app locally.

```bash
pnpm dev
```

4. Open the key surfaces:

- `/`
- `/chat`
- `/admin`
- `/admin/ingestion`
- `/admin/chat-config`

## Common Commands

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm smoke:chat
pnpm smoke:langchain-chat
pnpm smoke:admin-ui
pnpm check:ai-docs
```

## Architecture Snapshot

### Content and rendering

- Notion content is resolved and rendered through `react-notion-x`
- Public-facing pages live mainly under `pages/`
- Notion presentation and branding rules are layered through `styles/` and `components/`

### Chat and retrieval

- Chat entrypoints live under `pages/api/chat.ts` and `pages/api/langchain_chat.ts`
- Runtime settings are resolved through `lib/server/chat-settings.ts`
- Retrieval, ingestion, and document lifecycle logic live under `lib/rag/` and `lib/server/langchain/`
- Admin configuration defaults and presets are managed through `lib/server/admin-chat-config.ts`

### Storage and telemetry

- Vector storage uses Supabase + pgvector
- Telemetry uses Langfuse and PostHog
- Logging is governed by [docs/telemetry/implementation/telemetry-logging.md](./docs/telemetry/implementation/telemetry-logging.md)

## Documentation Map

Start here depending on the task:

- [docs/README.md](./docs/README.md): documentation portal and folder roles
- [docs/00-start-here/terminology.md](./docs/00-start-here/terminology.md): shared terms
- [docs/00-start-here/repository-map.md](./docs/00-start-here/repository-map.md): codebase orientation
- [docs/canonical/rag/rag-system.md](./docs/canonical/rag/rag-system.md): canonical RAG contract
- [docs/canonical/guardrails/guardrail-system.md](./docs/canonical/guardrails/guardrail-system.md): canonical chat guardrails
- [docs/operations/admin-guide.md](./docs/operations/admin-guide.md): admin workflows
- [docs/operations/local-llm-operations-checklist.md](./docs/operations/local-llm-operations-checklist.md): Ollama and LM Studio operations
- [docs/telemetry/README.md](./docs/telemetry/README.md): telemetry navigation

## Notes

- The repository still carries starter-kit ancestry in naming such as the package name, but the implementation has been substantially specialized.
- Documentation under `docs/` is operationally important, not just reference material.
