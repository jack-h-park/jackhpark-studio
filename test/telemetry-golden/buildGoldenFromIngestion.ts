export type GoldenTrace = {
  name?: string | null;
  metadata?: Record<string, unknown> | null;
  input?: unknown;
  output?: unknown;
};

export type GoldenObservation = {
  name: string;
  metadata?: Record<string, unknown> | null;
  input?: unknown;
  output?: unknown;
};

export type GoldenTelemetry = {
  traces: GoldenTrace[];
  observations: GoldenObservation[];
};

type IngestionEvent = {
  type?: string;
  body?: {
    name?: string;
    metadata?: Record<string, unknown> | null;
    input?: unknown;
    output?: unknown;
  };
};

type BatchPayload = {
  batch?: unknown;
};

function toBatchEvents(batch: unknown): IngestionEvent[] {
  if (typeof batch !== "object" || batch === null) {
    return [];
  }
  const payload = batch as BatchPayload;
  if (!Array.isArray(payload.batch)) {
    return [];
  }
  return payload.batch as IngestionEvent[];
}

function getMetadataStage(
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (!metadata) {
    return "";
  }
  const stage = metadata.stage;
  if (typeof stage === "string") {
    return stage;
  }
  return "";
}

export function buildGoldenFromIngestion(batches: unknown[]): GoldenTelemetry {
  const traces: GoldenTrace[] = [];
  const observations: GoldenObservation[] = [];

  for (const batch of batches) {
    const events = toBatchEvents(batch);
    for (const event of events) {
      if (event.type === "trace-create" && event.body) {
        traces.push({
          name: event.body.name ?? null,
          metadata: event.body.metadata ?? null,
          input: event.body.input,
          output: event.body.output,
        });
        continue;
      }
      if (
        event.type === "span-create" &&
        event.body &&
        typeof event.body.name === "string"
      ) {
        observations.push({
          name: event.body.name,
          metadata: event.body.metadata ?? null,
          input: event.body.input,
          output: event.body.output,
        });
        continue;
      }
      if (
        event.type === "generation-create" &&
        event.body &&
        typeof event.body.name === "string"
      ) {
        observations.push({
          name: event.body.name,
          metadata: event.body.metadata ?? null,
          input: event.body.input,
          output: event.body.output,
        });
      }
    }
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
