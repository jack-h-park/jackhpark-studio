# Notion/RAG Test Strategy

## Summary

Testing is split into deterministic PR gates, live smoke gates, and optional
content audits. PR checks must not require Notion, Supabase, LLM providers,
Langfuse, PostHog, or external network access. Live checks exercise the
deployed-style path and are reserved for scheduled or manual runs.

## PR Gate

Run these on every push and pull request:

- `pnpm test:unit`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm check:server-only-pages`

The unit suite covers pure contracts:

- Notion recordMap sanitization and fixture extraction
- Notion KaTeX detector behavior without fetching live Notion pages
- RAG context selection, citation grouping, cache-key dimensions
- telemetry metadata and golden payload normalization
- chat settings, guardrails, and admin policy helpers
- smoke response parsing for JSON, SSE, and plain streamed responses

## Test Matrix

| Risk                                       | Test or script                         | Primary signal                                                            | Gate                  |
| ------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------- | --------------------- |
| Notion recordMap shape breaks rendering    | `test/notion-fixture-contract.test.ts` | sanitized collection/view/block shape, extracted text/metadata            | PR                    |
| KaTeX detector regresses                   | `test/notion-katex.test.ts`            | equation block/decorations detected, normal text ignored                  | PR                    |
| RAG context/citation/cache contract drifts | `test/rag-contract.test.ts`            | selected context has citations, cache keys change on RAG-affecting inputs | PR                    |
| Chat smoke parser misses stream formats    | `test/smoke-chat-response.test.ts`     | JSON, SSE, and plain streamed bodies parse correctly                      | PR                    |
| Unified chat endpoint regresses            | `pnpm smoke:chat`                      | streaming response, cache-hit header, citations payload separator         | Live/manual           |
| Legacy chat endpoint regresses             | `pnpm smoke:langchain-chat`            | GET 405, POST streaming, debug-route inference                            | Live/manual           |
| Notion visual rendering drifts             | `pnpm qa:notion-polish`                | desktop/mobile screenshots for configured Notion pages                    | Live/manual           |
| Current Notion content starts using math   | `pnpm check:katex`                     | live Notion scan reports pages with KaTeX content                         | Optional manual audit |

## Live Gate

Live smoke runs are in `.github/workflows/live-smoke.yml` and are guarded by
`ENABLE_LIVE_SMOKE=1` plus required Supabase secrets. Missing live credentials
skip the job rather than fail PRs.

Live commands:

- `pnpm smoke:chat -- --baseUrl http://localhost:3000 --timeoutMs 45000`
- `pnpm smoke:langchain-chat`
- `pnpm qa:notion-polish -- --base-url http://localhost:3000` when the Codex
  Playwright wrapper is installed on the runner

The live gate verifies:

- `/api/chat` returns a non-empty streamed response
- repeated chat requests expose cache-hit smoke headers
- RAG prompts include the citations payload separator
- `/api/langchain_chat` preserves legacy method and streaming behavior
- Notion pages render across desktop and mobile screenshot profiles

Required live environment:

- `ENABLE_LIVE_SMOKE=1`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- at least one configured LLM provider key for non-safe-mode chat smoke

Optional live environment:

- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` for trace correlation
- Codex Playwright wrapper for `pnpm qa:notion-polish`

## Optional Content Audits

`pnpm check:katex` scans live Notion pages and should be treated as a content
inventory audit, not a code quality test. It requires network access and can
fail because of Notion fetch/auth/network issues. Use it when deciding whether
KaTeX-related imports or styles can be removed, or after a major Notion content
restructure.

`pnpm test:prettier` is retained as a formatting audit, but it is not part of
the deterministic PR gate while legacy formatting drift exists. Use it for
changed files or after a dedicated formatting cleanup.

`pnpm test:telemetry-golden` is a deterministic contract check for telemetry
payloads. `pnpm test:telemetry-golden:update` intentionally rewrites the golden
snapshot and must only be run when accepting a telemetry contract change.

## Fixture Policy

Keep fixtures small and purpose-built. Use page-type fixtures for profile,
table/list collection, gallery, and mixed content only when a contract needs
that shape. Use `recordMap.json` only for broader smoke reproduction where a
minimal fixture would hide the bug.

## Out Of Scope

Automated LLM answer-quality grading is intentionally out of scope for the first
pass. The current quality gate checks retrieval/citation/cache/telemetry
contracts rather than subjective response quality.
