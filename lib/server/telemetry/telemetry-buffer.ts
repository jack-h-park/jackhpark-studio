import type { LangfuseTraceOptions } from "@/lib/langfuse";
import { isTelemetryEnabled } from "@/lib/server/telemetry/telemetry-enabled";

type TelemetryEvent = {
  name: string;
  detail?: Record<string, unknown>;
  ts: number;
};

export type TelemetryContext = {
  sessionId?: string;
  requestId?: string;
  question?: string;
};

export function createTelemetryBuffer(context: TelemetryContext = {}) {
  const events: TelemetryEvent[] = [];

  const push = (name: string, detail?: Record<string, unknown>) => {
    events.push({ name, detail, ts: Date.now() });
  };

  const flush = async () => {
    if (!isTelemetryEnabled()) {
      return;
    }
    if (events.length === 0) {
      return;
    }

    const { telemetryLogger } = await import("@/lib/logging/logger");
    telemetryLogger.debug("[telemetry] flush-start", context);

    try {
      const langfuseModule = await import("@/lib/langfuse");
      const client = await langfuseModule.ensureLangfuseClient();
      if (!client) {
        telemetryLogger.debug("[telemetry] flush-skip-no-client");
        return;
      }

      const traceOptions: LangfuseTraceOptions = {
        name: "langchain-chat",
        sessionId: context.sessionId,
        metadata: {
          events,
          requestId: context.requestId,
          question: context.question,
        },
      };
      const trace = langfuseModule.createTrace(traceOptions);
      if (trace) {
        await trace.observation({
          name: "response-summary",
          metadata: {
            eventCount: events.length,
            requestId: context.requestId,
          },
        });
      }
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

  return { push, flush };
}
