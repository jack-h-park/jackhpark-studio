import type { LangfuseSpanProcessor } from "@langfuse/otel";

/**
 * Holds the process-wide Langfuse span processor created by `instrumentation.ts`.
 *
 * The processor is stashed on `globalThis` rather than exported as a module
 * binding on purpose. Next.js compiles `instrumentation.ts` into its own bundle,
 * so a request handler that imported the processor directly could resolve a
 * *second* instance of that module — one where `register()` never ran and the
 * processor is still null. Flushing that copy would silently drop every span.
 * A global key is shared across bundles.
 */
const PROCESSOR_KEY = "__jackhparkStudioLangfuseSpanProcessor__" as const;

type ProcessorHolder = Record<
  typeof PROCESSOR_KEY,
  LangfuseSpanProcessor | undefined
>;

function holder(): ProcessorHolder {
  return globalThis as unknown as ProcessorHolder;
}

export function setLangfuseSpanProcessor(
  processor: LangfuseSpanProcessor,
): void {
  holder()[PROCESSOR_KEY] = processor;
}

export function getLangfuseSpanProcessor(): LangfuseSpanProcessor | null {
  return holder()[PROCESSOR_KEY] ?? null;
}

/**
 * Drains buffered spans. Callers register the returned promise with `waitUntil`
 * so the send outlives the response, and attach their own `.catch` — this
 * module stays dependency-free on purpose.
 *
 * Next.js compiles `instrumentation.ts` for the edge runtime as well as Node,
 * and webpack follows even a runtime-guarded dynamic `import()`. Pulling the
 * domain logger in here therefore dragged `node:path` into the edge bundle and
 * failed the build. Keep this module's imports type-only.
 *
 * No-ops when no processor was registered — the edge runtime, and any
 * environment without Langfuse credentials.
 */
export async function flushLangfuseSpans(): Promise<void> {
  await getLangfuseSpanProcessor()?.forceFlush();
}
