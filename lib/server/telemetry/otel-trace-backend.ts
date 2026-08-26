import {
  LangfuseOtelSpanAttributes,
  type LangfuseSpan,
  startObservation,
} from "@langfuse/tracing";

import type {
  LangfuseMetadata,
  LangfuseObservationOptions,
  LangfuseTrace,
  LangfuseTraceOptions,
} from "@/lib/langfuse.node";

/**
 * OTel-backed implementation of the `LangfuseTrace` contract, for Langfuse v4.
 *
 * Deliberately mirrors the legacy signature rather than exposing the OTel API,
 * so the ~12 existing call sites stay untouched while the two backends run side
 * by side behind LANGFUSE_OTEL_TRACING.
 *
 * Three differences from the legacy backend are load-bearing:
 *
 * 1. There is one real root span per request. v4 has no trace entity — a trace
 *    is just the observations sharing a trace id — so the request's input and
 *    output belong on the root observation, not on a trace record.
 * 2. `update()` accumulates in memory and never re-exports. v4 rejects
 *    re-ingesting an id to patch it; the root is written once, when it ends.
 * 3. Trace-level attributes are copied onto every child span. v4 queries
 *    observations directly, so attributes that live only on the root cannot be
 *    used to filter its children.
 */

type TraceLevelAttributes = {
  traceName: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  version?: string;
};

function applyTraceAttributes(
  span: LangfuseSpan,
  attrs: TraceLevelAttributes,
): void {
  const otelSpan = span.otelSpan;
  otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_NAME, attrs.traceName);
  if (attrs.userId) {
    otelSpan.setAttribute(
      LangfuseOtelSpanAttributes.TRACE_USER_ID,
      attrs.userId,
    );
  }
  if (attrs.sessionId) {
    otelSpan.setAttribute(
      LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
      attrs.sessionId,
    );
  }
  if (attrs.tags && attrs.tags.length > 0) {
    otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_TAGS, attrs.tags);
  }
}

function mergeMetadata(
  prev: LangfuseMetadata | undefined,
  next: LangfuseMetadata | undefined,
): LangfuseMetadata | undefined {
  if (!prev) {
    return next;
  }
  if (!next) {
    return prev;
  }
  return { ...prev, ...next };
}

export function createOtelTrace(
  options: LangfuseTraceOptions,
  environment: string,
): LangfuseTrace {
  const root = startObservation(
    options.name,
    {
      input: options.input,
      output: options.output,
      metadata: options.metadata,
      version: options.version,
    },
    { startTime: new Date() },
  );

  // Accumulated trace-level state. Applied to the root when it ends, and copied
  // onto every child as it is created.
  let traceAttrs: TraceLevelAttributes = {
    traceName: options.name,
    userId: options.userId,
    sessionId: options.sessionId,
    tags: options.tags,
    version: options.version,
  };
  let pendingInput = options.input;
  let pendingOutput = options.output;
  let pendingMetadata = options.metadata;
  let ended = false;

  applyTraceAttributes(root, traceAttrs);

  const traceId = root.traceId;

  return {
    traceId,
    id: traceId,
    environment,

    observation: async (
      observationOptions: LangfuseObservationOptions,
    ): Promise<void> => {
      if (ended) {
        // A span created after the root closed would be an orphan in the tree.
        return;
      }
      const child = startObservation(
        observationOptions.name,
        {
          input: observationOptions.input,
          output: observationOptions.output,
          metadata: observationOptions.metadata,
          level: observationOptions.level,
          statusMessage: observationOptions.statusMessage,
          version: observationOptions.version,
        },
        {
          startTime: observationOptions.startTime
            ? new Date(observationOptions.startTime)
            : undefined,
          parentSpanContext: root.otelSpan.spanContext(),
        },
      );
      applyTraceAttributes(child, traceAttrs);
      child.end(
        observationOptions.endTime
          ? new Date(observationOptions.endTime)
          : undefined,
      );
    },

    update: async (updates: Partial<LangfuseTraceOptions>): Promise<void> => {
      // Accumulate only. The root is exported once, by end().
      if (updates.input !== undefined) {
        pendingInput = updates.input;
      }
      if (updates.output !== undefined) {
        pendingOutput = updates.output;
      }
      if (updates.metadata) {
        pendingMetadata = mergeMetadata(pendingMetadata, updates.metadata);
      }
      traceAttrs = {
        ...traceAttrs,
        ...(updates.name ? { traceName: updates.name } : {}),
        ...(updates.userId ? { userId: updates.userId } : {}),
        ...(updates.sessionId ? { sessionId: updates.sessionId } : {}),
        ...(updates.tags ? { tags: updates.tags } : {}),
        ...(updates.version ? { version: updates.version } : {}),
      };
    },

    end: (): void => {
      if (ended) {
        return;
      }
      ended = true;
      root.update({
        input: pendingInput,
        output: pendingOutput,
        metadata: pendingMetadata,
      });
      applyTraceAttributes(root, traceAttrs);
      root.end();
    },
  };
}
