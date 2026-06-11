# Handoff: Verify RAG retrieval-graph observability via Langfuse MCP

**Status:** open handoff · **Owner:** unassigned · **Created:** 2026-06-10

This is a self-contained runbook for a **fresh session** to connect the Langfuse
MCP server (`uvx langfuse-mcp`) and directly inspect the Langfuse side of the
LangGraph RAG retrieval pipeline. No prior conversation context is required.

## Background — what was built

`runRagRetrieval()` in [`lib/server/langchain/rag-retrieval-chain.ts`](../../lib/server/langchain/rag-retrieval-chain.ts)
runs the RAG read path as a **LangGraph `StateGraph`** with five nodes:
`rewrite → hyde → retrieve → rerank → context`. Observability is three-layered
(see [langchain-chat-architecture.md → Trace topology](../architecture/langchain-chat-architecture.md#trace-topology-langfuse--langsmith)):

| Layer | Mechanism | Lands in |
| --- | --- | --- |
| Node-level | `langfuse-langchain` `CallbackHandler` | a **separate** Langfuse trace, tagged `rag:retrieval-graph` |
| Stage-detail | `withSpan()` inside each stage | the **primary** Langfuse trace |
| Full graph | LangChain auto-tracer (`LANGSMITH_*`) | LangSmith run `rag-retrieval-graph` |

The node-span trace is **separate** (not nested) because the project's custom
`LangfuseTrace` (`lib/langfuse.node.ts`) is not a `LangfuseTraceClient`, so the
handler can't nest under it. The two Langfuse traces are correlated by:
- `sessionId` == the request's `requestId`
- `metadata.linkedTraceId` == the primary trace's `traceId`

**Already verified (2026-06-10):** LangSmith side works end-to-end (HTTP 200,
all nodes execute, zero "circular JSON" warnings after the state was trimmed to
serializable-only channels). The **Langfuse side has NOT been visually verified**
because local `.env.local` has no Langfuse keys, so the Langfuse client is
disabled locally (`createTrace` returns `undefined` → `input.trace` is null →
the node-span `CallbackHandler` is skipped).

## Prerequisites

- `uvx` is installed (`~/.local/bin/uvx`).
- Valid Langfuse keys for a project that will receive data:
  `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`
  (e.g. `https://cloud.langfuse.com`).

## Steps

### 1. Enable Langfuse locally
Add the three keys to `.env.local` (gitignored — safe for secrets). This makes
the dev server emit the primary trace **and** the separate node-span trace.

### 2. Register the Langfuse MCP server
Create/append `.mcp.json` at the repo root. **`.mcp.json` is currently
untracked** — if you put secrets in it, add it to `.gitignore` first, or prefer
exporting the keys in your shell and omitting the `env` block so `uvx` inherits
them.

```jsonc
{
  "mcpServers": {
    "langfuse": {
      "command": "uvx",
      "args": ["langfuse-mcp"],
      "env": {
        "LANGFUSE_PUBLIC_KEY": "pk-...",
        "LANGFUSE_SECRET_KEY": "sk-...",
        "LANGFUSE_HOST": "https://cloud.langfuse.com"
      }
    }
  }
}
```
Restart Claude Code so the `langfuse` MCP tools load (they appear as
`mcp__langfuse__*`).

### 3. Generate fresh Langfuse data
```bash
PORT=3000 pnpm next dev    # background; wait for "Ready in"
curl -sS -X POST http://localhost:3000/api/langchain_chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What projects has Jack worked on?"}],"reverseRagEnabled":true,"hydeEnabled":true,"rankerMode":"mmr"}'
```
Expect HTTP 200 with a cited answer. Note the `requestId` from the server logs
(`[rag] ... requestId: <uuid>`) — you'll use it to find both traces.

### 4. Inspect via Langfuse MCP (acceptance criteria)
Using the `mcp__langfuse__*` tools, confirm:
1. A **primary trace** exists carrying the `withSpan` detail spans:
   `reverse_rag`, `hyde`, `retrieval`, `reranker`, `context:selection`.
2. A **separate trace** tagged `rag:retrieval-graph` carrying the five LangGraph
   node spans (`rewrite`, `hyde`, `retrieve`, `rerank`, `context`).
3. The two are correlated: the node-span trace's `sessionId` equals the primary
   trace's `requestId`, and its `metadata.linkedTraceId` equals the primary
   trace's `traceId`.

### 5. Decision to record
Judge whether the **separate-but-correlated** topology is acceptable in the
Langfuse UI/MCP view, or whether to revisit **unifying into one nested tree**.
The trade-off table is in
[langchain-chat-architecture.md → Trace topology](../architecture/langchain-chat-architecture.md#trace-topology-langfuse--langsmith).
Current recommendation there is "keep separate" (LangSmith already gives the
single nested view; unifying Langfuse would force reconciling `@langfuse/client`
v4 with the `langfuse@3.x` bundled by `langfuse-langchain`). Confirm or overturn
that call based on what the MCP inspection actually shows.

## Done when
- `langfuse` MCP tools are callable in the session.
- All three acceptance checks in step 4 pass (or discrepancies are documented).
- The step-5 decision is recorded in the Trace topology doc section.
