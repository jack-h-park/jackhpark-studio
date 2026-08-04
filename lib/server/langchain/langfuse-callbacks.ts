import { CallbackHandler } from "langfuse-langchain";

import type { LangfuseTrace } from "@/lib/langfuse";
import { telemetryLogger } from "@/lib/logging/logger";

/**
 * Handlers created for an in-flight request, keyed by the primary trace id.
 *
 * These handlers own their own Langfuse v3 client and queue, which nothing else
 * drains: delivery is left to the SDK's background timer, and on serverless the
 * instance can be frozen the moment the response ends. The retrieval-stage
 * handler finishes mid-request and usually wins that race; the answer-stage
 * handler finishes last and usually loses it — which silently dropped the
 * `answer:root` trace, and with it the only record of real token usage and
 * cost, on 5 of 6 production chats. The request flushes them explicitly.
 */
const handlersByTraceId = new Map<string, CallbackHandler[]>();

function describeSdkError(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload instanceof Error) {
    return payload.message;
  }
  try {
    return JSON.stringify(payload) ?? String(payload);
  } catch {
    return String(payload);
  }
}

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
 *
 * environment is likewise explicit: without it the handler's own Langfuse
 * client falls back to "default", so these traces would be invisible to the
 * env-scoped views the primary trace lands in.
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

  const handler = new CallbackHandler({
    baseUrl: process.env.LANGFUSE_BASE_URL,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    environment: trace.environment,
    sessionId: sessionId ?? undefined,
    tags,
    metadata: { linkedTraceId: trace.traceId },
  });

  // The SDK's own error channel stringifies its payload with JSON.stringify,
  // which renders an Error as "{}" — every failure reached production logs as
  // `[Langfuse SDK] {}`, saying nothing. Log the real message instead.
  handler.langfuse.on("error", (payload: unknown) => {
    telemetryLogger.error("[langfuse-callbacks] sdk error", {
      traceId: trace.traceId,
      tags,
      error: describeSdkError(payload),
    });
  });

  const forTrace = handlersByTraceId.get(trace.traceId) ?? [];
  forTrace.push(handler);
  handlersByTraceId.set(trace.traceId, forTrace);

  return [handler];
}

/**
 * Drains every handler built for this trace and drops the registry entry.
 * Never throws: a lost span must not fail a chat response. Callers register the
 * returned promise with waitUntil so the send outlives the response.
 */
export async function flushLinkedLangfuseCallbacks(
  traceId: string | null | undefined,
): Promise<void> {
  if (!traceId) {
    return;
  }
  const handlers = handlersByTraceId.get(traceId);
  handlersByTraceId.delete(traceId);
  if (!handlers || handlers.length === 0) {
    return;
  }
  const results = await Promise.allSettled(
    handlers.map((handler) => handler.flushAsync()),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      telemetryLogger.error("[langfuse-callbacks] flush failed", {
        traceId,
        error: describeSdkError(result.reason),
      });
    }
  }
}
