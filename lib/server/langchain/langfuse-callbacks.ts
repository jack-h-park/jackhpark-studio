import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { CallbackHandler } from "@langfuse/langchain";

import type { LangfuseTrace } from "@/lib/langfuse";

/**
 * Build LangChain callbacks that emit LangGraph/LCEL spans for this request.
 *
 * The handler carries no client and resolves no host: it starts OTel spans
 * from the ambient context, and the process-wide LangfuseSpanProcessor exports
 * them. So the spans join whatever trace is active — which means callers must
 * invoke the chain inside `trace.runInContext(...)`. Without that the request
 * root is not the active span, the handler opens a trace of its own, and the
 * fragmentation this replaced comes back silently. `runInContext` covers the
 * two call sites; a third would need it too.
 *
 * Nothing here needs flushing. The v3 handler this replaced owned a client and
 * a queue that nothing drained, which lost the answer-stage trace — and with it
 * the only record of real token usage — on 5 of 6 production chats.
 * `flushLangfuseSpans()` now drains the one processor for everything.
 */
export function buildLinkedLangfuseCallbacks(params: {
  trace: LangfuseTrace | null | undefined;
  sessionId?: string | null;
  tags: string[];
}): BaseCallbackHandler[] {
  const { trace, sessionId, tags } = params;
  if (!trace) {
    return [];
  }
  return [
    new CallbackHandler({
      sessionId: sessionId ?? undefined,
      tags,
    }),
  ];
}
