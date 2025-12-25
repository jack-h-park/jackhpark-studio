import type { GoldenTelemetry } from "./buildGoldenFromIngestion";

const VOLATILE_KEYS = new Set([
  "id",
  "traceId",
  "spanId",
  "parentObservationId",
  "sessionId",
  "startTime",
  "endTime",
  "timestamp",
  "durationMs",
  "latencyMs",
]);

const FORBIDDEN_KEYS = new Set([
  "chatConfig",
  "ragConfig",
  "provider",
  "model",
]);

const REQUEST_ID_PLACEHOLDER = "<requestId>";

function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  return Number(value.toFixed(4));
}

function normalizeArray(value: unknown[]): unknown[] {
  const normalized = value
    .map((entry) => normalizeValue(entry))
    .filter((entry): entry is unknown => entry !== undefined);

  const allObjects = normalized.every(
    (entry) => typeof entry === "object" && entry !== null,
  );

  if (!allObjects) {
    return normalized;
  }

  const stringified = normalized.map((entry) => ({
    entry,
    key: (entry as Record<string, unknown>).doc_id ?? null,
  }));

  if (stringified.every((item) => typeof item.key === "string")) {
    return stringified
      .toSorted((a, b) => (a.key as string).localeCompare(b.key as string))
      .map((item) => item.entry);
  }

  return normalized.toSorted((a, b) => {
    const aString = JSON.stringify(a);
    const bString = JSON.stringify(b);
    return aString.localeCompare(bString);
  });
}

function normalizeObject(
  value: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (value == null) {
    return value;
  }
  const entries = Object.keys(value).toSorted();
  const normalized: Record<string, unknown> = {};
  for (const key of entries) {
    if (VOLATILE_KEYS.has(key) || FORBIDDEN_KEYS.has(key)) {
      continue;
    }
    const raw = value[key];
    if (raw === undefined) {
      continue;
    }
    if (key === "requestId") {
      normalized[key] = REQUEST_ID_PLACEHOLDER;
      continue;
    }
    const child = normalizeValue(raw);
    if (child !== undefined) {
      normalized[key] = child;
    }
  }
  return normalized;
}

function normalizeValue(value: unknown): unknown {
  if (value == null) {
    return value;
  }
  if (typeof value === "number") {
    return normalizeNumber(value);
  }
  if (Array.isArray(value)) {
    return normalizeArray(value);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return normalizeObject(obj);
  }
  return value;
}

const normalizeEntry = <
  T extends { metadata?: Record<string, unknown> | null },
>(
  entry: T,
): T => {
  const normalized: T = {
    ...entry,
    metadata: normalizeObject(entry.metadata ?? null),
  };

  if ("input" in entry) {
    const normalizedInput = normalizeValue(entry.input);
    if (normalizedInput === undefined) {
      delete (normalized as T & { input?: unknown }).input;
    } else {
      (normalized as T & { input?: unknown }).input = normalizedInput;
    }
  }

  if ("output" in entry) {
    const normalizedOutput = normalizeValue(entry.output);
    if (normalizedOutput === undefined) {
      delete (normalized as T & { output?: unknown }).output;
    } else {
      (normalized as T & { output?: unknown }).output = normalizedOutput;
    }
  }

  return normalized;
};

export function normalizeGolden(data: GoldenTelemetry): GoldenTelemetry {
  return {
    traces: data.traces.map(normalizeEntry),
    observations: data.observations.map(normalizeEntry),
  };
}
