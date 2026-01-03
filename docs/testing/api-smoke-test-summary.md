# API Smoke Test Summary

## Overview

This document summarizes the API-level smoke tests that exercise the chat endpoints (LangChain and Native). These scripts are intended for manual execution and provide quick signal on streaming behavior, backend routing, and basic response health.

## Scripts

### `scripts/smoke/test-local-llm-matrix.ts`

- Purpose: Matrix test `/api/native_chat` across backend combinations (e.g., `ollama`, `lmstudio`, unset, invalid).
- Coverage:
  - Sends a minimal message payload with a configured model and preset.
  - Validates whether streaming starts and captures the first chunk (if present).
  - Reports status code and error payload summary for non-2xx responses.
- Output summary includes:
  - HTTP status code
  - `streaming` flag
  - Optional first chunk preview
  - Error message (if any)

### `scripts/smoke/test-local-llm-deep.ts`

- Purpose: Deeper smoke test that iterates multiple prompt scenarios across local backends.
- Coverage:
  - Short chat sanity check
  - Long prompt handling
  - RAG-themed prompt behavior
  - Multi-turn context retention
- Output summary includes:
  - Streaming chunk count
  - Time to first chunk (TTFB)
  - Total duration
  - Output length and first chunk preview
  - Error summary (if any)

## Notes

- These scripts are smoke tests, not unit tests. They hit a running local server and rely on environment configuration.
- They are useful for quick regression checks after backend/config changes.
### `scripts/smoke/chat-api-smoke.ts`

- Purpose: Core chat smoke test for `/api/langchain_chat` (default) or `/api/native_chat`.
- Coverage:
  - Sends a short prompt and validates streaming/JSON response handling.
  - Repeats the request to validate cache-hit signaling via `x-cache-hit`.
  - Sends a RAG-leaning prompt and checks for non-empty answers.
- Output summary includes:
  - Per-case PASS/FAIL
  - Chunk counts and timing
  - Optional `x-trace-id` (Native only when available)

### `scripts/smoke/smoke-langchain-chat.mjs`

- Purpose: Legacy smoke check for `/api/langchain_chat` and debug surfaces.
- Coverage:
  - Verifies `GET` returns 405 and `POST` streams a response.
  - Checks the debug route to infer debug surfaces availability.
- Output summary includes:
  - First-byte timing
  - Stream completion signal
