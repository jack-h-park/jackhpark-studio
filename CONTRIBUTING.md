# Contributing

This repository is a specialized personal portfolio and RAG/chat platform, not a stock starter-kit checkout. Contributing work should preserve that reality in both code and documentation.

## Development Setup

Requirements:

- recent Node.js
- `pnpm`

Install and run locally:

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Useful verification commands:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm smoke:chat
pnpm smoke:langchain-chat
pnpm smoke:admin-ui
pnpm check:ai-docs
pnpm check:docs
```

## Before You Change Code

- Read [readme.md](./readme.md) for the current repo entrypoint.
- Read [docs/README.md](./docs/README.md) for the documentation map.
- Use [docs/00-start-here/repository-map.md](./docs/00-start-here/repository-map.md) when you need codebase orientation.
- Use [docs/00-start-here/documentation-governance.md](./docs/00-start-here/documentation-governance.md) when your change affects stack framing, env vars, presets, telemetry, or operational behavior.

## Documentation Expectations

Documentation is part of the implementation surface here.

- If you change a setup step, review `readme.md`, `.env.example`, and relevant `docs/operations/*`.
- If you change chat presets, models, or guardrail behavior, review `docs/chat/*` and the governing canonical docs.
- If you change telemetry or logging semantics, review `docs/telemetry/*` and the canonical telemetry contract.
- If you change stack framing or major routing/runtime shape, review `AGENTS.md`, `CLAUDE.md`, and `docs/00-start-here/repository-map.md`.

Do not leave current behavior documented only in audits, incident reports, or historical plans.

## react-notion-x Fork Workflow

This repo still supports local work against the `react-notion-x` fork.

Common commands:

```bash
pnpm deps:use-local
pnpm deps:use-remote
pnpm deps:release
pnpm setup-hooks
```

For the full process, use [docs/operations/react-notion-x-deployment.md](./docs/operations/react-notion-x-deployment.md).

## Verification Standard

Before you describe documentation or code work as complete, run the relevant verification commands and inspect the output. At minimum, use the commands that cover the surfaces you changed.
