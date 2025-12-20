import type { LangfuseTrace, LangfuseTraceOptions } from "@/lib/langfuse";
import { hashPayload } from "@/lib/server/chat-cache";
import { isTelemetryEnabled } from "@/lib/server/telemetry/telemetry-enabled";
import { buildTelemetryMetadata } from "@/lib/server/telemetry/telemetry-metadata";
import { buildSafeTraceInputSummary } from "@/lib/server/telemetry/telemetry-summaries";
import { withSpan } from "@/lib/server/telemetry/withSpan";

type TelemetryEvent = {
  name: string;
  detail?: Record<string, unknown>;
  ts: number;
};

export type TelemetryContext = {
  sessionId?: string;
  requestId?: string;
  question?: string;
  includePii?: boolean;
};

const requestTraceMap = new Map<string, LangfuseTrace>();

export function setRequestTrace(requestId: string, trace: LangfuseTrace) {
  requestTraceMap.set(requestId, trace);
}

export function getRequestTrace(requestId: string): LangfuseTrace | null {
  return requestTraceMap.get(requestId) ?? null;
}

export function clearRequestTrace(requestId: string) {
  requestTraceMap.delete(requestId);
}

export function createTelemetryBuffer(context: TelemetryContext = {}) {
  const events: TelemetryEvent[] = [];
  const currentContext: TelemetryContext = { ...context };

  const push = (name: string, detail?: Record<string, unknown>) => {
    events.push({ name, detail, ts: Date.now() });
  };

  const updateContext = (updates: Partial<TelemetryContext>) => {
    Object.assign(currentContext, updates);
  };

  const ensureTrace = async (): Promise<LangfuseTrace | null> => {
    if (!isTelemetryEnabled()) {
      return null;
    }
    const requestId = currentContext.requestId;
    if (!requestId) {
      return null;
    }
    const existing = getRequestTrace(requestId);
    if (existing) {
      return existing;
    }

    const langfuseModule = await import("@/lib/langfuse");
    const client = await langfuseModule.ensureLangfuseClient();
    if (!client) {
      return null;
    }

    const question = currentContext.question;
    const includePii = process.env.LANGFUSE_INCLUDE_PII === "true";
    const traceInput = buildSafeTraceInputSummary({
      questionLength: question?.length ?? 0,
    });
    const traceQuestionMeta = {
      questionHash: question ? hashPayload({ q: question }) : null,
      questionLength: question?.length ?? 0,
      ...(includePii && question ? { question } : {}),
    };
    const traceOptions: LangfuseTraceOptions = {
      name: "langchain-chat",
      sessionId: currentContext.sessionId,
      input: traceInput,
      metadata: {
        requestId,
        questionHash: traceQuestionMeta.questionHash,
        questionLength: traceQuestionMeta.questionLength,
        ...(includePii && question ? { question } : {}),
      },
    };
    const trace = langfuseModule.createTrace(traceOptions);
    if (trace) {
      setRequestTrace(requestId, trace);
      return trace;
    }
    return null;
  };

  const flush = async () => {
    if (!isTelemetryEnabled()) {
      return;
    }
    if (events.length === 0) {
      return;
    }

    const { telemetryLogger } = await import("@/lib/logging/logger");
    telemetryLogger.debug("[telemetry] flush-start", currentContext);

    try {
      const trace = await ensureTrace();
      if (!trace) {
        telemetryLogger.debug("[telemetry] flush-skip-no-client");
        return;
      }
      const question = currentContext.question;
      const questionLength = question?.length ?? 0;
      const questionHash = question ? hashPayload({ q: question }) : null;
      const includePii = currentContext.includePii === true;
      const metadataAdditional: Record<string, unknown> = {
        eventCount: events.length,
        requestId: currentContext.requestId ?? null,
        questionHash,
        questionLength,
      };
      if (includePii && question) {
        metadataAdditional.question = question;
      }
      const metadata = buildTelemetryMetadata({
        kind: "response",
        requestId: currentContext.requestId ?? null,
        additional: metadataAdditional,
      });

      await withSpan(
        {
          trace,
          requestId: currentContext.requestId ?? null,
          name: "response-summary",
          metadata,
        },
        async () => undefined,
      );
      telemetryLogger.debug("[telemetry] flush-done", {
        events: events.length,
      });
    } catch (err) {
      const { telemetryLogger: logger } = await import("@/lib/logging/logger");
      logger.error("[telemetry] flush-failed", err);
    } finally {
      events.length = 0;
    }
  };

  return { push, flush, updateContext, ensureTrace };
}
