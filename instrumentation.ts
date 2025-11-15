import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const hasLangfuseConfig =
  Boolean(process.env.LANGFUSE_PUBLIC_KEY) &&
  Boolean(process.env.LANGFUSE_SECRET_KEY);

// We only enable OTEL auto-instrumentation when explicitly requested via env.
// This avoids logging every Next.js route (chat-config, health checks, etc.)
// to Langfuse by default. RAG/chat traces still work via @langfuse/tracing.
const enableOtel = process.env.LANGFUSE_ENABLE_OTEL === "true";

if (hasLangfuseConfig && enableOtel) {
  const processor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_HOST,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV,
    exportMode: process.env.VERCEL ? "immediate" : "batched",
  });

  const provider = new NodeTracerProvider({
    spanProcessors: [processor],
  });

  provider.register();
}
