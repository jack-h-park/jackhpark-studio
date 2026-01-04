# API Smoke Test: Chat Endpoints

## Overview

This smoke test validates API-level chat behavior without a browser. It targets the unified `/api/chat` endpoint (LangChain) and verifies streaming health, cache hits, and Safe Mode fallbacks.

## What It Validates

- HTTP 200 response from the chat endpoint
- Streaming output (SSE or chunked text)
- Non-empty answer content
- Cache-hit verification on repeated requests (via `x-cache-hit` header)

## How To Run (Local)

1. Start the dev server in a separate terminal.
2. Run the smoke test:

```bash
pnpm smoke:chat
```

Optional flags:

```bash
pnpm smoke:chat -- --baseUrl=http://localhost:3000 --timeoutMs=30000
```

Optional preset override:

```bash
SMOKE_CHAT_PRESET=local-required pnpm smoke:chat
```

For Safe Mode coverage, enable a preset with `safeMode=true` and rerun the script; it should still stream a response while emitting `safe_mode=true` in the telemetry metadata.

## Cache-Hit Headers

The script checks for `x-cache-hit` on the second request. Headers are emitted only when smoke headers are enabled:

- Enabled when `NODE_ENV` is not `production`, or
- Explicitly by setting `SMOKE_HEADERS=1`

Optional header:

- `x-trace-id`

## Interpreting Failures

- `HTTP 4xx/5xx`: endpoint or config error
- `answer too short`: model did not respond with enough content
- `expected streamed chunk`: streaming did not deliver content
- `missing x-cache-hit`: smoke headers are not enabled or cache is disabled
