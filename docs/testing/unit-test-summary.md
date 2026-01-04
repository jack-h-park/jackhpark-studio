# Unit Test Summary

## Overview

현재 프로젝트의 단위 테스트는 `node:test`와 `node:assert/strict`를 사용해 **순수 함수/유틸 로직**을 검증합니다. 대부분 RAG 파이프라인의 설정 정규화, 텔레메트리 결정 로직, 후보 문서 머징 등 **서버 사이드 비즈니스 로직**에 집중되어 있습니다.

## Test Framework

- Runner: `node:test`
- Assertion: `node:assert/strict`
- 테스트 위치: `test/*.test.ts`

## Unit Test Coverage (File별 요약)

### `test/rag-k-normalization.test.ts`
- 대상: `normalizeRagK` (`@/lib/server/langchain/ragRetrievalChain`)
- 검증 내용:
  - rerank 비활성화 시 `retrieveK`/`finalK` 정규화
  - rerank 활성화 시 `rerankK` 기본값(미지정) 적용 및 명시값 보존
  - `finalK`가 `rerankK`를 초과하지 않도록 클램핑

### `test/chat-langfuse.test.ts`
- 대상: `decideTelemetryMode`, `buildRetrievalTelemetryEntries`
  - `decideTelemetryMode` (`@/lib/telemetry/chat-langfuse`)
    - 샘플링 비율 0/1 처리
    - 난수 샘플링 임계값 판정
    - detail level(`minimal`/`standard`/`verbose`)에 따른 스냅샷/상세 로깅 여부
    - 강제 트레이싱 플래그
  - `buildRetrievalTelemetryEntries` (`@/lib/server/chat-common`)
    - 입력 문서 필드 정규화(`docId`/`doc_id`/`document_id` 등)
    - 유사도/가중치 필드 매핑(`baseSimilarity`, `metadata_weight`, `metadata.weight`)
    - `doc_type`, `persona_type`, `is_public` 메타데이터 정규화
    - 최대 엔트리 수 제한

### `test/chat-guardrails-sanitize.test.ts`
- 대상: `sanitizeChatSettings` (`@/lib/server/chat-guardrails`)
- 검증 내용:
  - guardrail 파라미터 범위 클램핑(유사도, 토큰 버짓, 요약 조건 등)
  - runtime flags 타입/enum 보정 및 기본값 적용
  - 변경 감지(`changes`) 존재 여부
  - 정상 범위 값 유지(변경 없음)

### `test/multi-query.test.ts`
- 대상: `pickAltQueryType`, `mergeCandidates` (`@/lib/server/langchain/multi-query`)
- 검증 내용:
  - 대체 쿼리 타입 결정 우선순위(Rewrite > Hyde > None)
  - 후보 머징 시 동일 키는 더 높은 유사도 유지
  - 동점 시 결정적 순서 유지(기존 순서 안정성)

## Unit Test 범위 밖의 테스트 스크립트

단위 테스트와 별도로, `/api/chat`의 LangChain 경로와 Safe Mode fallback을 검증하는 수동 스모크 스크립트가 존재합니다.

- `pnpm smoke:chat` (`scripts/smoke/chat-api-smoke.ts`): `/api/chat`을 호출해 SSE 배포, `x-cache-hit`, 스트리밍 청크, 타임아웃, 그리고 `safe_mode` 텔레메트리까지 확인합니다. `SMOKE_CHAT_PRESET=local-required` 또는 `safeMode=true` 옵션을 주면 안전 모드 경로도 커버할 수 있습니다.
- `scripts/smoke/smoke-langchain-chat.mjs` / `prewarm-langchain-chat.mjs`: LangChain 디버그 surfaces (405/OPTIONS, readiness)와 prewarm 경로를 점검하며 전체 런타임 준비 상태를 체크합니다.

## 현재 테스트 성격 요약

- **순수 함수/정규화 로직** 중심 (I/O 의존성 없음)
- **RAG 설정/텔레메트리 결정/후보 병합** 등 핵심 로직에 집중
- 네트워크/외부 서비스 의존 테스트는 `scripts/`의 수동 실행 스크립트로 분리

## 명시적 커버리지 갭(관찰 기준)

- API 핸들러 단의 통합 테스트는 별도 파일/디렉터리에서 보이지 않음
- DB/외부 서비스 연계 테스트는 단위 테스트 범위에 포함되지 않음
- 프론트엔드 UI/컴포넌트 테스트는 현재 단위 테스트 목록에서 확인되지 않음
