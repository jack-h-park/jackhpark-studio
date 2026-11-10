# Public API initialization budget

## Approved scope

Continue the usage-recovery investigation and remove demonstrated unnecessary work without merging, deploying, changing monitoring cadence or changing freshness intervals. Keep this work separate from Draft PR246.

## Evidence and approach

An offline esbuild/CJS entry-initialization experiment in seven fresh Node22 processes per route found that both `/api/chat` and `/api/chat-runtime` initialize `@langfuse/tracing`, `@opentelemetry/api` and the Supabase SDK before handling a request. Median local import CPU was approximately54ms and57ms respectively. No credentials were supplied and fetch was blocked; no attempted fetch was observed. These are local measurements, not Vercel billing attribution or evidence that this explains the entire CPU allowance overrun.

The chat handler validates methods and bodies before calling settings resolution, but a static import still evaluates that module first. The settings barrel also exports Langfuse settings, whose environment-name getter unnecessarily imports the telemetry implementation even though the same getter already lives in a pure module.

Alternatives: extending response-cache lifetimes would change freshness policy; simplifying runtime settings output could break clients. Selected approach: preserve all output and timing contracts and remove unnecessary module initialization instead.

## Design

- After valid chat request validation, dynamically import the existing model-settings implementation within the current error boundary. Rejected methods and malformed bodies must not evaluate it. Preserve session configuration, runtime forwarding and valid request error handling.
- Public settings APIs import the model-settings implementation directly rather than the broad settings barrel. Preserve coalescing, fresh origin reads, JSON envelopes, cache tags,60s public TTL and all bypass conditions.
- Langfuse settings import `getAppEnv` directly from the pure app-env module. Preserve environment precedence, TTL and settings values. Actual chat tracing continues to use the existing telemetry implementation.
- The first narrow-import experiment did not materially reduce initialization: the shared logger still reached telemetry and database modules through logging/config. Import the environment getter directly there too, and defer the existing admin-config import until `buildLoggingConfig()` needs its database-backed telemetry settings. Keep the database query, merge precedence, clamping, kill-switch behavior and failures unchanged. Pure domain-level fallbacks must not initialize those SDKs.
- Test real route execution at mocked external boundaries, including initialization counts, invalid requests, successful dispatch and settings failures. Separately execute the environment settings module while disallowing telemetry SDK loading.

## Limits

Do not modify provider selection, tracing contracts, admin save invalidation, one-hour ISR, navigation freshness, ingestion, monitors or dependencies. Do not call live providers or Production endpoints. No measured production saving is promised. Valid origin settings reads still incur their intended database/model-resolution work.
