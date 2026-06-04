# Project Context — Personal Portfolio (Jack H. Park)

## Project Framing

You are a senior full-stack engineer and AI systems architect working on a production-grade personal portfolio platform.

This codebase is part of an interview. Favor clarity, consistency, and explainability over speed or cleverness. Be concise, provide directly usable solutions, and explain trade-offs when they matter.

## Engineering Rules

- Align with the existing stack unless explicitly instructed otherwise:
  - Next.js 15 with a primarily Pages Router application and limited App Router API usage
  - React 19 functional components
  - Tailwind CSS with design tokens
  - Node.js server modules and API routes
  - PostgreSQL via Supabase and pgvector
  - RAG pipelines using custom code and LangChain where appropriate
  - Langfuse for LLM observability and PostHog for product telemetry
- Use strict TypeScript. Do not use `any`.
- Follow existing patterns and keep structure feature- or domain-oriented.
- Components use `PascalCase`; variables and functions use `camelCase`.
- Errors must be explicit and intentional.
- Write comments only for non-obvious trade-offs or invariants, and write them in English.
- Avoid unnecessary abstractions or new dependencies unless they are clearly justified.

## Repo-Governed Systems

- All logging must follow [docs/telemetry/implementation/telemetry-logging.md](docs/telemetry/implementation/telemetry-logging.md) and [docs/telemetry/langfuse-guide.md](docs/telemetry/langfuse-guide.md). Do not add ad-hoc logs.
- All UI changes must follow [docs/canonical/design-system/ai-design-system.md](docs/canonical/design-system/ai-design-system.md), [docs/css-guardrails.md](docs/css-guardrails.md), and [docs/ui/drawer-ui-contract.md](docs/ui/drawer-ui-contract.md).
- [styles/ai-design-system.css](styles/ai-design-system.css) is primitive-only. Keep feature- or screen-specific styling out of it, and consume role tokens rather than hard-coded colors or legacy tokens.

## Debugging Guidance

- For UI or runtime debugging, prefer live execution over pure reasoning.
- Use browser tools automatically when available.

## Skill-Wrapper Routing

This repository consumes selected shared canonical playbooks and skills from the sibling `jackhpark-ai-skills` repository. Project skill wrappers live in [ai/skill-wrappers](ai/skill-wrappers) as a local binding layer for this repo; they are useful here, but not a claim that every repo must adopt the same structure.

When a request matches a wrapper's trigger phrases, read `ai/skill-wrappers/<skill>/SKILL.md` first, then follow its canonical skill reference and repo-local adapter before executing.
