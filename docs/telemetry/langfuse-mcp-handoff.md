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
| Node-level | `@langfuse/langchain` `CallbackHandler` | spans nested under the request root, tagged `rag:retrieval-graph` |
| Stage-detail | `withSpan()` inside each stage | spans parented directly to the request root |
| Full graph | LangChain auto-tracer (`LANGSMITH_*`) | LangSmith run `rag-retrieval-graph` |

All of it is **one Langfuse trace**. The handler parents itself from ambient
OTel context, and the invocation sites wrap the call in
`trace.runInContext(...)` so the request root is the active span.

> Until the v4 migration the node spans lived in a separate trace correlated by
> `sessionId` and `metadata.linkedTraceId`, because the v3 handler could not
> nest under the project's custom `LangfuseTrace`. Both the separate trace and
> the correlation field are gone.

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
1. **Exactly one trace** exists for the request, rooted at `langchain-chat`.
2. It carries the `withSpan` detail spans (`reverse_rag`, `hyde`, `retrieval`,
   `reranker`, `context:selection`) directly under the root.
3. It carries a `rag-retrieval-graph` subtree with the LangGraph node spans
   (`__start__`, `rewrite`, `hyde`, `retrieve`, `rerank`, `context`), and an
   `answer:root` subtree containing `answer:prompt` and `answer:llm`, with the
   provider Generation under the latter.

`hyde` legitimately appears twice, at two depths — once as a node span, once as
a detail span. See the architecture note on why they are siblings rather than
parent and child.

### 5. Decision recorded
The separate-but-correlated topology was kept for a time and has since been
**overturned** — the v4 migration unified everything into one nested tree. The
reasoning that justified keeping it (two Langfuse SDK majors would have to be
reconciled) stopped applying once the v5 handler dropped its own client. See
[langchain-chat-architecture.md → Trace topology](../architecture/langchain-chat-architecture.md#trace-topology-langfuse--langsmith).

## Done when
- `langfuse` MCP tools are callable in the session.
- All three acceptance checks in step 4 pass (or discrepancies are documented).
- The step-5 decision is recorded in the Trace topology doc section.
