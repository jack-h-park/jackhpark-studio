# Chat API Smoke Guide

## Purpose

This guide describes the smoke tests for chat API behavior without a browser.
It covers the unified `/api/chat` endpoint, the legacy `/api/langchain_chat`
path, streaming health, cache signaling, and Safe Mode fallback behavior.

## Primary Scripts

### `pnpm smoke:chat`

- Underlying script: `scripts/smoke/chat-api-smoke.ts`
- Covers:
  - unified `/api/chat`
  - streaming and non-empty output
  - repeat-request cache signaling via `x-cache-hit`
  - Safe Mode fallback validation when enabled

### `pnpm smoke:langchain-chat`

- Underlying script: `scripts/smoke/smoke-langchain-chat.mjs`
- Covers:
  - legacy `/api/langchain_chat`
  - `GET` returns `405`
  - `POST` streams a response
  - debug-surface inference

## How To Run

1. Start the local dev server.
2. Run the primary smoke command:

```bash
pnpm smoke:chat
```

Optional unified-endpoint flags:

```bash
pnpm smoke:chat -- --baseUrl=http://localhost:3000 --timeoutMs=30000
```

Optional preset override:

```bash
SMOKE_CHAT_PRESET=local-required pnpm smoke:chat
```

For legacy coverage:

```bash
pnpm smoke:langchain-chat
```

For Safe Mode coverage, enable a preset with `safeMode=true` and rerun the
unified smoke script. It should still stream a response while emitting
`safe_mode=true` in telemetry metadata.

## Expected Validation Signals

- HTTP 200 on `/api/chat`
- streaming output or chunked text
- non-empty answer content
- `x-cache-hit` on the second unified request when smoke headers are enabled
- optional `x-trace-id`
- `GET /api/langchain_chat` returns `405`
- `POST /api/langchain_chat` streams a response

Smoke headers are emitted when:

- `NODE_ENV` is not `production`, or
- `SMOKE_HEADERS=1` is set

## Output Summary

The scripts report:

- per-case PASS/FAIL
- chunk counts and timing for the unified path
- first-byte timing for the legacy path
- optional trace correlation header values

## Interpreting Failures

- `HTTP 4xx/5xx`: endpoint or config failure
- `answer too short`: model returned too little content
- `expected streamed chunk`: streaming did not deliver content
- `missing x-cache-hit`: smoke headers are off or cache signaling is unavailable
- `GET` not returning `405` on the legacy path: method handling regression
