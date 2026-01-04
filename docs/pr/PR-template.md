# PR Summary: Auto RAG Policy Fix & Deep Search

## Goal

- Prevent Auto RAG from being disabled by persistent settings
- Introduce safe, message-scoped forced retrieval

## Non-Goals

- No Always-on manual retrieval mode
- No user-level persistence changes

## Key Decisions

- capability ≠ execution
- shouldRun = forced || (capability && weak)
- Deep Search is message-scoped only

## Invariants

- Auto is never disabled by settings
- Forced execution never persists across turns
- Forbidden session keys are dropped server-side

## Verification

- auto-rag-trigger.test.ts
- chat-settings-policy.test.ts
- Manual diagnostics via “Retry with Deep Search”
