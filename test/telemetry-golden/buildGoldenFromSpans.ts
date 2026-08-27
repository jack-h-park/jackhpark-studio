import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

import type {
  GoldenObservation,
  GoldenTelemetry,
} from "./buildGoldenFromIngestion";

/**
 * Projects exported OTel spans into the same shape the legacy ingestion golden
 * uses, so the two backends can be diffed against each other while
 * LANGFUSE_OTEL_TRACING is being rolled out.
 *
 * The root span is emitted as the single `traces` entry. That is not a
 * translation convenience: in v4 there is no trace entity, and the root
 * observation is what now carries the request-level name, metadata, input and
 * output the trace record used to hold. Everything below it is an observation.
 *
 * Attribute encoding, confirmed against @langfuse/tracing 5.10.1:
 * - `langfuse.observation.input` / `.output` are JSON strings
 * - `langfuse.observation.metadata.<key>` is one attribute per key; scalars are
 *   stored raw and nested objects as JSON strings
 */

const INPUT = "langfuse.observation.input";
const OUTPUT = "langfuse.observation.output";
const METADATA_PREFIX = "langfuse.observation.metadata.";

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function readMetadata(span: ReadableSpan): Record<string, unknown> | null {
  const metadata: Record<string, unknown> = {};
  let found = false;
  for (const [key, value] of Object.entries(span.attributes)) {
    if (!key.startsWith(METADATA_PREFIX)) {
      continue;
    }
    found = true;
    metadata[key.slice(METADATA_PREFIX.length)] = parseMaybeJson(value);
  }
  return found ? metadata : null;
}

function getMetadataStage(
  metadata: Record<string, unknown> | null | undefined,
): string {
  const stage = metadata?.stage;
  return typeof stage === "string" ? stage : "";
}

export function buildGoldenFromSpans(spans: ReadableSpan[]): GoldenTelemetry {
  const rootSpanIds = new Set(
    spans
      .filter((span) => !span.parentSpanContext)
      .map((span) => span.spanContext().spanId),
  );

  const traces: GoldenTelemetry["traces"] = [];
  const observations: GoldenObservation[] = [];

  for (const span of spans) {
    const entry = {
      name: span.name,
      metadata: readMetadata(span),
      input: parseMaybeJson(span.attributes[INPUT]),
      output: parseMaybeJson(span.attributes[OUTPUT]),
    };
    if (rootSpanIds.has(span.spanContext().spanId)) {
      traces.push(entry);
      continue;
    }
    observations.push(entry);
  }

  observations.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    return getMetadataStage(a.metadata).localeCompare(
      getMetadataStage(b.metadata),
    );
  });

  return { traces, observations };
}
