# API Smoke Test Summary

## Overview

This document summarizes the API-level smoke tests that exercise the local LLM `/api/native_chat` endpoint. These scripts are intended for manual execution and provide quick signal on streaming behavior, backend routing, and basic response health.

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
