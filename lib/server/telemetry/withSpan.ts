import type { LangfuseObservationOptions, LangfuseTrace } from "@/lib/langfuse";

type SpanTimingArgs = {
  name: string;
  startMs: number;
  endMs: number;
  requestId?: string | null;
};

type SpanTiming = {
  startTime: string;
  endTime: string;
};

type SpanArgs = Omit<LangfuseObservationOptions, "startTime" | "endTime"> & {
  trace: LangfuseTrace | null | undefined;
  requestId?: string | null;
};

type SpanOverrides = Omit<
  LangfuseObservationOptions,
  "name" | "startTime" | "endTime"
>;

function shouldWarnZeroDuration(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return process.env.LANGFUSE_DEBUG_SPAN_TIMING !== "0";
}

export function buildSpanTiming({
  name,
  startMs,
  endMs,
  requestId,
}: SpanTimingArgs): SpanTiming {
  let finalEndMs = endMs;
  if (finalEndMs <= startMs) {
    if (shouldWarnZeroDuration()) {
      console.warn("[telemetry] span duration 0ms", {
        name,
        requestId: requestId ?? null,
      });
    }
    finalEndMs = startMs + 1;
  }

  return {
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(finalEndMs).toISOString(),
  };
}

export async function withSpan<T>(
  args: SpanArgs,
  fn: () => Promise<T>,
  buildObservation?: (result: T) => SpanOverrides,
): Promise<T> {
  if (!args.trace) {
    return fn();
  }

  const startMs = Date.now();
  let didResolve = false;
  let result: T | undefined;

  try {
    result = await fn();
    didResolve = true;
    return result;
  } finally {
    const { startTime, endTime } = buildSpanTiming({
      name: args.name,
      startMs,
      endMs: Date.now(),
      requestId: args.requestId,
    });
    const overrides =
      didResolve && buildObservation
        ? buildObservation(result as T)
        : undefined;
    void args.trace.observation({
      name: args.name,
      input: overrides?.input ?? args.input,
      output: overrides?.output ?? args.output,
      metadata: overrides?.metadata ?? args.metadata,
      level: overrides?.level ?? args.level,
      statusMessage: overrides?.statusMessage ?? args.statusMessage,
      version: overrides?.version ?? args.version,
      startTime,
      endTime,
    });
  }
}
