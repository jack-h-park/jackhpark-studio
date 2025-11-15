import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const debugEnabled = (process.env.DEBUG_LANGFUSE ?? "")
  .toLowerCase()
  .startsWith("true");
const logDebug = (...args: unknown[]) => {
  if (debugEnabled) {
    console.log("[langfuse]", ...args);
  }
};

const hasLangfuseConfig =
  Boolean(process.env.LANGFUSE_PUBLIC_KEY) &&
  Boolean(process.env.LANGFUSE_SECRET_KEY);

if (!hasLangfuseConfig) {
  logDebug("Tracing disabled: Langfuse keys missing.");
} else {
  logDebug("Initializing Langfuse span processor…", {
    env: process.env.APP_ENV ?? process.env.NODE_ENV,
    exportMode: process.env.VERCEL ? "immediate" : "batched",
  });

  const processor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_HOST,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV,
    exportMode: process.env.VERCEL ? "immediate" : "batched",
    // Only export spans that are relevant to Langfuse / AI tracing.
    // This avoids logging every Next.js route (chat-config, health checks, etc.)
    // while still capturing traces created via @langfuse/tracing and Vercel AI SDK telemetry.
    shouldExportSpan: ({ otelSpan }) => {
      const scopeName = otelSpan.instrumentationScope.name;

      logDebug("OTEL span captured", {
        scope: scopeName,
        spanName: otelSpan.name,
        spanKind: otelSpan.kind,
      });

      // "langfuse-sdk" → spans created by @langfuse/tracing (observe/updateActiveTrace/etc.)
      // "ai"           → spans created by Vercel AI SDK when experimental_telemetry is enabled.
      return scopeName === "langfuse-sdk" || scopeName === "ai";
    },
  });

  const provider = new NodeTracerProvider({
    spanProcessors: [processor],
  });

  provider.register();
  logDebug("Langfuse span processor registered.");
}
