/**
 * OpenTelemetry bootstrap for Langfuse v4 ingestion.
 *
 * Next.js calls `register()` once per runtime before any request is served.
 *
 * There is deliberately no `NODE_ENV === "production"` guard here. Vercel builds
 * both Preview and Production with NODE_ENV=production, so such a guard would
 * silently disable tracing in exactly the two environments that matter.
 */
export async function register(): Promise<void> {
  // Next.js evaluates this module on the edge runtime too, where NodeSDK cannot
  // load. pages/api/social-image.tsx is the only edge route today.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  // Without credentials the processor would construct fine and then fail every
  // export, so skip registration entirely and leave the flush helper a no-op.
  if (
    !process.env.LANGFUSE_PUBLIC_KEY ||
    !process.env.LANGFUSE_SECRET_KEY ||
    !process.env.LANGFUSE_BASE_URL
  ) {
    return;
  }

  // Imported dynamically so the edge bundle never pulls in Node-only modules.
  //
  // NodeTracerProvider, not NodeSDK: NodeSDK is an auto-configuration wrapper
  // that drags in the gRPC OTLP exporter (and through it `zlib`, `http2`, …),
  // which webpack cannot resolve for this bundle and which fails the build.
  // None of that is needed — LangfuseSpanProcessor carries its own OTLP/HTTP
  // exporter, and this app registers no auto-instrumentation.
  const [
    { LangfuseSpanProcessor },
    { NodeTracerProvider },
    appEnv,
    otelRuntime,
  ] = await Promise.all([
    import("@langfuse/otel"),
    import("@opentelemetry/sdk-trace-node"),
    import("@/lib/app-env"),
    import("@/lib/server/telemetry/otel-runtime"),
  ]);

  const processor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,

    // v5 dropped the per-span `environment` attribute in favour of this. Derive
    // it from getAppEnv() rather than a separate env var so the OTel traces land
    // in the same buckets as the legacy ones and there is a single source of
    // truth for the deploy target.
    environment: appEnv.getAppEnv(),

    // On Vercel the instance can be frozen the moment a response ends. Batched
    // export loses whatever is still queued at that point — the failure that
    // cost this app the `answer:root` span on 5 of 6 production chats before
    // waitUntil was added. "immediate" exports each span as it ends; the
    // forceFlush() in the request drain then only has to await in-flight sends.
    exportMode: appEnv.isServerlessRuntime() ? "immediate" : "batched",
  });

  otelRuntime.setLangfuseSpanProcessor(processor);

  // Nothing is auto-instrumented, so no HTTP, DB or framework spans are
  // produced — only spans this app creates explicitly.
  new NodeTracerProvider({ spanProcessors: [processor] }).register();
}
