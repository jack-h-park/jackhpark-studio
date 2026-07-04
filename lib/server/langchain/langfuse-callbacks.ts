import { CallbackHandler } from "langfuse-langchain";

import type { LangfuseTrace } from "@/lib/langfuse";

/**
 * Build LangChain callbacks that emit LangGraph/LCEL spans into a Langfuse trace
 * correlated to our primary custom trace.
 *
 * The handler cannot attach to our custom LangfuseTrace directly (which isn't a
 * LangfuseTraceClient), so the spans land in a SEPARATE trace correlated by
 * sessionId (requestId) and a linkedTraceId metadata field.
 *
 * Host/keys are passed explicitly rather than left to env autodiscovery:
 * langfuse-langchain (langfuse v3) reads the host from LANGFUSE_BASEURL and
 * otherwise defaults to the EU cloud, but the rest of the app configures
 * Langfuse via LANGFUSE_BASE_URL (us.cloud). Relying on env alone ships these
 * spans to the wrong region, where they silently 401 and are dropped.
 */
export function buildLinkedLangfuseCallbacks(params: {
  trace: LangfuseTrace | null | undefined;
  sessionId?: string | null;
  tags: string[];
}): CallbackHandler[] {
  const { trace, sessionId, tags } = params;
  if (!trace) {
    return [];
  }

  return [
    new CallbackHandler({
      baseUrl: process.env.LANGFUSE_BASE_URL,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      sessionId: sessionId ?? undefined,
      tags,
      metadata: { linkedTraceId: trace.traceId },
    }),
  ];
}
