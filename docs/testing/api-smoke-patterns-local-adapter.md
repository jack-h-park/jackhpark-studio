# API Smoke Local Adapter

This document is the repo-specific adapter for the canonical playbook `jackhpark-ai-skills/playbooks/api-smoke-patterns.md` and the canonical skill `jackhpark-ai-skills/skills/dev/chat-api-smoke-regression/SKILL.md`.

It intentionally contains only local information needed to apply that method inside `nextjs-react-notion-x`.

## Local Vocabulary

- **Unified chat endpoint**: the primary smoke target for current chat behavior.
- **Legacy chat endpoint**: the older endpoint that still matters for legacy/debug-surface smoke checks.
- **Safe Mode**: the repo’s degraded-mode path that disables retrieval and advanced enhancements while still returning a response.
- **Local-required preset**: the preset path used to force local-backend routing during smoke validation.
- **Smoke headers**: the local mechanism that exposes cache/trace headers for smoke runs.
- **Debug surfaces**: local debug-route and debug-flag behavior associated with the legacy chat path.

## Primary Local Entrypoints

- `/api/chat`
  - Primary unified endpoint for current chat smoke validation.
  - Expected to exercise the LangChain-backed runtime through the current dispatcher path.
- `/api/langchain_chat`
  - Legacy smoke target.
  - Used when validating method handling, wrapper import behavior, streaming startup, and debug-surface inference.

## Primary Local Docs

- [docs/testing/chat-api-smoke-guide.md](../../docs/testing/chat-api-smoke-guide.md)
- [docs/incidents/langchain_chat_postmortem.md](../../docs/incidents/langchain_chat_postmortem.md)
- [docs/operations/local-llm-operations-checklist.md](../../docs/operations/local-llm-operations-checklist.md)
- [docs/architecture/engine-parity-report.md](../../docs/architecture/engine-parity-report.md)

## Repo-Specific Invariants

- `/api/chat` is the default smoke target for current chat behavior.
- `/api/langchain_chat` remains relevant for legacy-path smoke coverage and debug-surface checks.
- Cache validation on `/api/chat` relies on a local smoke-visible signal rather than generic response semantics.
- Safe Mode must still return a response when enabled through the local preset or session configuration path.
- Local-backend validation is performed through the local-required preset flow rather than a generic provider toggle.
- The legacy endpoint has explicit method behavior expectations:
  - `GET` should return `405 Method Not Allowed`
  - `POST` should stream a response

## Repo-Specific Exclusions

- Do not treat `/api/langchain_chat` as the primary production path when the goal is current chat smoke coverage.
- Do not assume smoke-header visibility in every environment; local conditions control whether the headers are emitted.
- Do not use this adapter as a deep retrieval or telemetry debugging guide once the smoke failure has already been localized.
- Do not interpret Safe Mode as a generic shared degraded-mode concept; it is a local product/runtime behavior.

## Local Commands and Scripts

- `pnpm smoke:chat`
  - Primary smoke runner for `/api/chat`.
- `tsx scripts/smoke/chat-api-smoke.ts`
  - Underlying script for the unified endpoint smoke path.
- `pnpm smoke:langchain-chat`
  - Legacy smoke runner for `/api/langchain_chat`.
- `node scripts/smoke/smoke-langchain-chat.mjs`
  - Underlying script for the legacy endpoint path.
- `node scripts/smoke/prewarm-langchain-chat.mjs`
  - Supplemental prewarm path for the legacy endpoint workflow when needed.

## Local Headers and Validation Signals

- `x-cache-hit`
  - Local repeat-request cache validation signal on `/api/chat`.
  - Expected on the second request when smoke headers are available.
- `x-trace-id`
  - Optional local trace correlation header during smoke runs.

## Local Flags and Mode Switches

- `SMOKE_CHAT_PRESET=local-required`
  - Forces the smoke run through the local-required preset flow.
- `SMOKE_HEADERS=1`
  - Enables smoke headers when they are not already available through non-production behavior.
- `safeMode=true`
  - Local degraded-mode switch used in preset or session config coverage.
- `EXPECT_DEBUG_SURFACES=0`
  - Asserts that debug surfaces are expected to be off for legacy smoke validation.
- `EXPECT_DEBUG_SURFACES=1`
  - Asserts that debug surfaces are expected to be on for legacy smoke validation.
- `DEBUG_SURFACES_ENABLED=1`
  - Local server-side switch that enables the legacy endpoint’s debug surfaces.

## Degraded-Mode and Fallback Expectations

### Safe Mode

- Safe Mode is the local degraded-mode path for `/api/chat`.
- Smoke validation should confirm:
  - the endpoint still responds
  - retrieval-dependent output is reduced appropriately for Safe Mode
  - local telemetry/metadata reflects the Safe Mode path when that validation is in scope

### Local-Backend Fallback

- The local-required preset flow is the local route for validating local-LLM enforcement.
- Smoke validation should confirm whether the backend is available or blocked under the preset, rather than inferring state from the UI alone.

### Legacy Debug-Surface Behavior

- The legacy `/api/langchain_chat` smoke path is also used to infer whether debug surfaces are enabled or disabled on the running server.
- Shell environment and running server state may differ; local smoke interpretation must prefer observed endpoint behavior over shell assumptions.
