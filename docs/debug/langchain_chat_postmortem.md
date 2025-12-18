# Langchain Chat Postmortem

## Root cause
- In Next dev the heavy `langchain_chat_impl_heavy` graph pulled in Node-only dependencies (Langfuse + `crypto`) during instrumentation and debug probes, so Webpack/Turbopack spent 10–60s compiling before the route could start streaming.
- Even when the import eventually succeeded, the streaming path would wait for the first LM chunk, so simple `curl` clients saw 0 bytes and timed out before the first token arrived.

## Fix summary
- Rebuilt `lib/langfuse` as a server-only boundary (`lib/langfuse.server.ts`) so instrumentation doesn’t resolve Node builtins, keeping the shim/entry path lightweight.
- Added an early header/first-byte guarantee inside `langchain_chat_impl_heavy.ts` (headers are emitted and flushed before any Saturn work, and the streaming helper reuses the same flags) so the connection never stays at 0 bytes.
- Removed the diagnostic probes/debug routes/scripts now that the core issue is addressed, and documented the new guardrails.
- Cleaned up the handler so every path writes/ends the response without ever returning objects (avoids Next’s “API handler should not return a value” warning).

## Verification
1. `curl -i --max-time 3 http://127.0.0.1:3000/api/langchain_chat`
   - Expect `HTTP/1.1 405 Method Not Allowed` within 100 ms.
2. `curl -v -N --http1.1 --max-time 25 http://127.0.0.1:3000/api/langchain_chat -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"hi"}]}'`
   - Expect HTTP headers (status 200 + chunked) and any streamed chunk (there is no guaranteed early marker when `CHAT_DEBUG` is unset) within ~10 s, followed by the streamed answer and `CITATIONS_SEPARATOR` payload.
3. Watch the dev server logs to confirm there are no `ERR_HTTP_HEADERS_SENT` or “API handler should not return a value” warnings while the POST request streams.

## Regression checks
- `pnpm smoke:langchain-chat` runs a lightweight smoke test against a running dev server and asserts that:
  - `GET /api/langchain_chat` responds 405 within ~3 s.
  - `POST /api/langchain_chat` returns 200, emits the first chunk in under 2 s, and drains the stream.
  - No transport errors are emitted.

Run this script after starting `pnpm dev` to ensure the first-byte guarantee and streaming behavior stay working without needing manual curl commands.

## Re-enabling deep tracing (developer option)
Set `CHAT_DEBUG=1` and visit `/api/_debug/heavy-import` to unlock extra diagnostics (debug query flags, verbose log hooks, etc.). Without that env var the route responds 404 and `debug_early_flush` / `debug_no_external` are no-ops, so production traffic stays lean. `CHAT_DEBUG=1` also enables the early marker/headers when `debug_early_flush=1`. The instrumentation `register()` hook can point to a helper that imports the heavy handler with its own timeout (e.g., `scripts/diagnose-heavy-import.ts`) when deeper tracing is necessary.

### Server-only / telemetry guardrails
- `pages/api/*` and all `lib/server/api/*` code must only import the Node-safe `lib/langfuse.server.ts`; the `lib/langfuse.next-server.ts` wrapper (which pulls in `server-only`) is reserved for App Router server components and must never be referenced in API routes.  
- When `TELEMETRY_ENABLED=false`, no telemetry packages are imported at all; the handler merely buffers events and flushes them *after* the response, so telemetry toggles cannot block the chat stream.
