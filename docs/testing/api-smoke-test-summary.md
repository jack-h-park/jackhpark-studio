# API Smoke Test Summary

## Overview

This document summarizes the API-level smoke tests that exercise the unified chat endpoint (`/api/chat`). The scripts are intended for manual execution and provide quick signal on streaming behavior, cache hits, and the new Safe Mode fallback.

## Scripts

### `scripts/smoke/chat-api-smoke.ts`

- Purpose: Core chat smoke test for `/api/chat`, covering LangChain streaming plus the Safe Mode fallback.
- Coverage:
  - Sends a short prompt and validates streaming/JSON response handling from `/api/chat`.
  - Repeats the request to validate cache-hit signaling via `x-cache-hit`.
  - Sends a RAG-leaning prompt and ensures the answer is non-empty while checking `safe_mode` telemetry when Safe Mode is enabled.
- Output summary includes:
  - Per-case PASS/FAIL
  - Chunk counts and timing
  - Optional `x-trace-id`

### `scripts/smoke/smoke-langchain-chat.mjs`

- Purpose: Legacy smoke check for `/api/langchain_chat` and debug surfaces.
- Coverage:
  - Verifies `GET` returns 405 and `POST` streams a response.
  - Checks the debug route to infer debug surfaces availability.
- Output summary includes:
  - First-byte timing
  - Stream completion signal

## Notes

- These scripts are smoke tests, not unit tests. They hit a running local server and rely on environment configuration.
- They are useful for quick regression checks after backend/config changes.
