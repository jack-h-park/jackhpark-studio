// The shape both the golden snapshot and its normalizer are written against.
// Kept separate from the builder so the projection can change without the
// fixture's contract moving with it.

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
