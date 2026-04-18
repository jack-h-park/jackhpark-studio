# Unit Test Summary

## Overview

현재 프로젝트의 단위 테스트는 `node:test`와 `node:assert/strict`를 사용해
**외부 서비스에 의존하지 않는 순수 계약**을 검증합니다. PR gate에서는
Notion, Supabase, LLM provider, Langfuse, PostHog, 외부 네트워크가 없어도
실행 가능한 테스트만 필수로 다룹니다.

## Test Framework

- Runner: `node:test`
- Assertion: `node:assert/strict`
- 테스트 위치: `test/*.test.ts`
- 공통 helper: `test/helpers/`
- fixture: `test/fixtures/`

## Coverage Summary

### Notion contracts

- `test/notion-fixture-contract.test.ts`
  - fixture recordMap에서 title/plain text/source timestamp/metadata 추출을 검증합니다.
  - malformed collection/view/block shape가 renderer-safe shape로 보정되는지 검증합니다.
- `test/notion-katex.test.ts`
  - `hasKaTeXContent`가 equation block, inline equation decoration, LaTeX-like fragment를 감지하는지 검증합니다.
  - 일반 텍스트는 KaTeX content로 오탐하지 않는지 검증합니다.

### RAG and cache contracts

- `test/rag-contract.test.ts`
  - context window selection, dedupe, citation payload grouping, RAG-affecting cache key dimensions을 검증합니다.
- `test/rag-k-normalization.test.ts`
  - rerank enabled/disabled 상태의 effective K ordering을 검증합니다.
- `test/multi-query.test.ts`
  - 대체 쿼리 선택과 multi-query candidate merge의 deterministic ordering을 검증합니다.
- `test/selection-dedupe.test.ts`
  - chunk/doc 단위 dedupe metric을 검증합니다.
- `test/cache-key.test.ts`
  - response/retrieval cache key가 model, provider, summary, RAG flags를 반영하는지 검증합니다.
- `test/auto-rag-trigger.test.ts`
  - weak retrieval, forced flags, suppression 조건에서 Auto-RAG trigger 결정을 검증합니다.

### Chat settings, guardrails, and UI policy

- `test/chat-guardrails-sanitize.test.ts`
  - guardrail numeric bounds와 runtime flag enum 보정을 검증합니다.
- `test/chat-settings-policy.test.ts`
  - user-tunable setting enforcement를 검증합니다.
- `test/require-local-policy.test.ts`
  - local-required model routing/fallback policy를 검증합니다.
- `test/settings-section-rag-retrieval.test.tsx`
  - RAG retrieval settings UI helper와 rendered markup contract를 검증합니다.
- `test/admin-chat-config.presets.test.ts`
  - approved admin preset defaults를 검증합니다.

### Telemetry contracts

- `test/chat-langfuse.test.ts`
  - trace sampling/detail-level decision과 retrieval telemetry entry normalization을 검증합니다.
- `test/langfuse-metadata.test.ts`
  - generation input, cache metadata, retrieval-used inference를 검증합니다.
- `test/langfuse-generations.test.ts`, `test/langfuse-scores.test.ts`, `test/langfuse-tags.test.ts`
  - Langfuse generation/score/tag helper behavior를 검증합니다.
- `test/telemetry-config-snapshot.test.ts`
  - telemetry config summary와 stable hash behavior를 검증합니다.
- `test/trace-metadata-merge.test.ts`
  - monotonic cache/RAG flags, first-write intent, terminal abort, numeric merge policy를 검증합니다.
- `test/telemetry-golden/telemetry-golden.knowledge-standard.test.ts`
  - standard knowledge intent telemetry payload의 golden snapshot을 검증합니다.

### Smoke parser and operational helpers

- `test/smoke-chat-response.test.ts`
  - chat smoke parser가 JSON, SSE, plain streamed response를 읽고 citations payload separator를 감지하는지 검증합니다.
- `test/fetch-favicon.test.ts`
  - favicon fetch timeout, private IP redirect block, cache/inflight behavior를 검증합니다.
- `test/admin-documents-import-graph.test.ts`
  - admin documents page가 heavy URL metadata import chain을 정적으로 끌어오지 않는지 검증합니다.
- `test/document-preview-slot.test.ts`, `test/rag-documents-stats.test.ts`, `test/embedding-resolution.test.ts`, `test/logging-config.test.ts`
  - admin/RAG document display, embedding provider availability, logging config helper behavior를 검증합니다.

## Outside Unit Tests

- `pnpm smoke:chat`
  - running dev server의 `/api/chat`을 호출해 streaming, cache-hit header, citations payload separator를 검증합니다.
- `pnpm smoke:langchain-chat`
  - running dev server의 legacy `/api/langchain_chat`에서 GET 405, POST streaming, debug-route inference를 검증합니다.
- `pnpm smoke:admin-ui`
  - admin route availability를 검증합니다.
- `pnpm qa:notion-polish`
  - desktop/mobile Notion render screenshot을 캡처합니다.
- `pnpm check:katex`
  - live Notion content inventory audit입니다. PR 필수 테스트가 아니며 네트워크/Notion fetch에 의존합니다.

## Remaining Gaps

- API handler를 in-process로 호출하는 deterministic integration test는 아직 없습니다.
- Supabase/pgvector와 실제 LLM provider를 포함한 end-to-end 검증은 live smoke 또는 수동 검증으로 분리되어 있습니다.
- 브라우저 기반 visual regression은 `qa:notion-polish`에 의존하며 PR unit test에는 포함하지 않습니다.
- LLM answer-quality grading은 아직 자동화하지 않았습니다. 현재 gate는 retrieval/citation/cache/telemetry 계약 중심입니다.
