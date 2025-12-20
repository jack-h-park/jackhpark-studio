# PR Summary

- What changed?
- Why now?
- User-visible impact (if any):

## Scope

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Chore / Infra
- [ ] Docs
- [ ] Experiment / Spike

## Key Areas Touched

- [ ] `components/`
- [ ] `components/ui/` (design system primitives)
- [ ] `styles/ai-design-system.css`
- [ ] `pages/` / `pages/api/`
- [ ] `app/api/`
- [ ] `pages/admin/`
- [ ] `lib/server/`
- [ ] `lib/rag/`
- [ ] `lib/logging/` or `lib/telemetry/`
- [ ] `lib/local-llm/`
- [ ] `scripts/`
- [ ] `supabase/`
- [ ] `docs/`

# Codex / AI Assistance (Required if used)

## Codex prompt(s) used

> Paste or summarize the prompt(s) used for code generation or refactoring.

- Prompt summary:
- Files generated/modified by Codex:
- Manual edits after generation (if any):

---

# RAG Configuration Changes (if applicable)

- [ ] `ragTopK` / `similarityThreshold`
- [ ] `ragContextTokenBudget` / `ragContextClipTokens` / `historyBudget`
- [ ] `reverseRAG` / `reverseRagMode` (`precision`/`recall`)
- [ ] `hyde` / `hydeMode`
- [ ] `ragMultiQueryMode` / `ragMultiQueryMaxQueries`
- [ ] `ranker` (`none` / `mmr` / `cohere-rerank`)
- [ ] `ragRanking` (docType / persona weights)
- [ ] `retrievalTtlSeconds` / `responseTtlSeconds`
- [ ] embedding model / vector space (`rag_chunks_*`)

Notes:
- 

---

# Design System & UI Consistency (if UI touched)

- [ ] Uses tokens from `styles/ai-design-system.css` / Tailwind `bg-ai-*` + `text-ai-*`
- [ ] Uses primitives from `components/ui/` (Card, Section, HeadingWithIcon, MetaCard, Field)
- [ ] Uses `cn(...)` for class merging
- [ ] Uses `InteractionScope` for disabled/loading/readOnly flows
- [ ] Admin screens use `AdminPageShell` + `PageHeaderCard` where applicable
- [ ] No hardcoded colors (use `--ai-*` tokens / `color-mix`)
- [ ] Light/dark verified

# Logging & Observability

## Console / Local Logging

- [ ] Domain loggers used (`ragLogger`, `ingestionLogger`, `notionLogger`, `llmLogger`, `telemetryLogger`)
- [ ] Log levels gated by `LOG_*` env vars (no legacy `DEBUG_*`)
- [ ] No user content logged by default

## Telemetry (Langfuse)

- [ ] Telemetry gating verified (`TELEMETRY_ENABLED`, `TELEMETRY_*`)
- [ ] Trace input/output summaries present
- [ ] `retrieval_attempted` / `retrieval_used` / `insufficient` semantics preserved
- [ ] Cache flags correct (retrieval/response cache hit)
- [ ] No PII unless `LANGFUSE_INCLUDE_PII="true"`
- [ ] Langfuse keys/base URL set when needed (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`)
- [ ] Telemetry buffer flush remains non-blocking (`lib/server/telemetry/telemetry-buffer.ts`)
- [ ] Telemetry semantics verified using `docs/telemetry/telemetry-audit-checklist.md`

## Analytics (PostHog)

- [ ] `POSTHOG_API_KEY` / `POSTHOG_HOST` usage verified (if touched)
- [ ] No high-cardinality or PII properties

# Verification

## Automated

- [ ] Typecheck (`pnpm typecheck`)
- [ ] Lint (`pnpm lint`)
- [ ] Unit tests (`pnpm test:unit`) (CI runs this: `.github/workflows/build.yml`)
- [ ] Prettier check (`pnpm test:prettier`) (if TS/TSX touched)
- [ ] Local LLM tests (`pnpm test:llm:matrix`, `pnpm test:llm:deep`) (if local LLM paths changed)
- [ ] Full test sweep (`pnpm test`) (runs all `test:*` scripts)

## Manual (required when applicable)

- [ ] Dev server (`pnpm dev`) and exercised the changed path
- [ ] Build (`pnpm build`) and Start (`pnpm start`) (if prod-only behavior touched)
- [ ] Chat smoke (`pnpm smoke:langchain-chat`) hits `/api/langchain_chat`
- [ ] Streaming: start → partial tokens → completion (if streaming-related)
- [ ] Abort/disconnect path (if streaming-related)
- [ ] Admin UI load (if admin-related): `/admin/chat-config` or `/admin/ingestion`

### RAG / Retrieval (if applicable)

- [ ] Cache miss path verified
- [ ] Cache hit path verified
- [ ] Citations render as expected (count + content)

---

# Risk & Rollback

## Risk level

- [ ] Low (isolated / internal / easy revert)
- [ ] Medium (touches core flow but guarded)
- [ ] High (touches engine selection, caching semantics, or prompt/telemetry contracts)

## Rollback plan

- Revert commit(s):
- Feature flag / env toggle:
- Known safe fallback:

---

# Screenshots / Logs (if relevant)
- 

# Follow-ups
- [ ] Add/adjust tests
- [ ] Update docs
- [ ] Telemetry dashboard tweaks
- [ ] Performance / latency check
