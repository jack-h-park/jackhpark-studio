import { randomUUID } from "node:crypto";

import { LangfuseClient } from "@langfuse/client";

export type AppEnv = "dev" | "preview" | "prod";

const langfuseBaseUrl = process.env.LANGFUSE_BASE_URL;
const isLangfuseConfigured =
  Boolean(process.env.LANGFUSE_PUBLIC_KEY) &&
  Boolean(process.env.LANGFUSE_SECRET_KEY) &&
  Boolean(langfuseBaseUrl);

const langfuseClient = isLangfuseConfigured
  ? new LangfuseClient({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      baseUrl: langfuseBaseUrl!,
      timeout: Number(process.env.LANGFUSE_TIMEOUT ?? 5),
    })
  : null;
let ingestionEnabled = Boolean(langfuseClient);

const DEFAULT_SAMPLE_RATES: Record<AppEnv, number> = {
  prod: 1,
  preview: 1,
  dev: 0.3,
};

const SAMPLE_RATES: Record<AppEnv, number> = {
  dev: sanitizeSampleRate(
    process.env.LANGFUSE_SAMPLE_RATE_DEV,
    DEFAULT_SAMPLE_RATES.dev,
  ),
  preview: sanitizeSampleRate(
    process.env.LANGFUSE_SAMPLE_RATE_PREVIEW,
    DEFAULT_SAMPLE_RATES.preview,
  ),
  prod: sanitizeSampleRate(
    process.env.LANGFUSE_SAMPLE_RATE_PROD,
    DEFAULT_SAMPLE_RATES.prod,
  ),
};

function sanitizeSampleRate(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsed));
}

export function getAppEnv(): AppEnv {
  const fromAppEnv = process.env.APP_ENV?.toLowerCase();

  if (
    fromAppEnv === "dev" ||
    fromAppEnv === "preview" ||
    fromAppEnv === "prod"
  ) {
    return fromAppEnv;
  }

  const normalizedNodeEnv = process.env.NODE_ENV?.toLowerCase();
  if (normalizedNodeEnv === "production") {
    return "prod";
  }
  if (normalizedNodeEnv === "preview") {
    return "preview";
  }
  if (normalizedNodeEnv === "development" || normalizedNodeEnv === "dev") {
    return "dev";
  }
  if (normalizedNodeEnv === "test") {
    return "dev";
  }

  return "dev";
}

export function shouldTrace(env: AppEnv): boolean {
  if (!isLangfuseConfigured) {
    return false;
  }

  const sampleRate = SAMPLE_RATES[env] ?? 0;
  return Math.random() < sampleRate;
}

export type LangfuseMetadata = Record<string, unknown>;

export type LangfuseTraceOptions = {
  name: string;
  id?: string;
  sessionId?: string;
  userId?: string;
  input?: unknown;
  output?: unknown;
  metadata?: LangfuseMetadata;
  tags?: string[];
  release?: string;
  version?: string;
  environment?: string;
  public?: boolean;
};

export type LangfuseObservationLevel =
  | "DEBUG"
  | "DEFAULT"
  | "WARNING"
  | "ERROR";

export type LangfuseObservationOptions = {
  name: string;
  input?: unknown;
  output?: unknown;
  metadata?: LangfuseMetadata;
  level?: LangfuseObservationLevel;
  statusMessage?: string;
  version?: string;
  startTime?: string;
  endTime?: string;
};

interface LangfuseTraceContext {
  traceId: string;
  environment: string;
}

interface TraceBody {
  id: string;
  timestamp: string;
  name?: string;
  userId?: string;
  sessionId?: string;
  input?: unknown;
  output?: unknown;
  metadata?: LangfuseMetadata;
  tags?: string[];
  release?: string;
  version?: string;
  environment?: string;
  public?: boolean;
}

interface SpanBody {
  id: string;
  traceId: string;
  name: string;
  startTime?: string;
  endTime?: string;
  input?: unknown;
  output?: unknown;
  metadata?: LangfuseMetadata;
  environment?: string;
  level?: LangfuseObservationLevel;
  statusMessage?: string;
  version?: string;
}

type LangfuseIngestionEvent =
  | {
      type: "trace-create";
      id: string;
      timestamp: string;
      body: TraceBody;
    }
  | {
      type: "span-create";
      id: string;
      timestamp: string;
      body: SpanBody;
    };

export interface LangfuseTrace {
  traceId: string;
  id: string;
  environment: string;
  observation: (options: LangfuseObservationOptions) => Promise<void>;
  update: (options: Partial<LangfuseTraceOptions>) => Promise<void>;
}

function buildTraceEvent(
  fields: LangfuseTraceOptions & { id: string; environment: string },
): LangfuseIngestionEvent {
  const timestamp = new Date().toISOString();
  return {
    type: "trace-create",
    id: randomUUID(),
    timestamp,
    body: {
      id: fields.id,
      timestamp,
      name: fields.name,
      userId: fields.userId,
      sessionId: fields.sessionId,
      input: fields.input,
      output: fields.output,
      metadata: fields.metadata,
      tags: fields.tags,
      release: fields.release,
      version: fields.version,
      environment: fields.environment,
      public: fields.public,
    },
  };
}

export function createTrace(
  options: LangfuseTraceOptions,
): LangfuseTrace | undefined {
  if (!langfuseClient) {
    return undefined;
  }

  const env = getAppEnv();
  if (!shouldTrace(env)) {
    return undefined;
  }

  const traceId = options.id ?? options.sessionId ?? randomUUID();
  const traceEnvironment = options.environment ?? env;
  let currentTraceFields: LangfuseTraceOptions & {
    id: string;
    environment: string;
  } = {
    ...options,
    id: traceId,
    environment: traceEnvironment,
  };
  const traceContext: LangfuseTraceContext = {
    traceId,
    environment: traceEnvironment,
  };

  void sendIngestionEvents([buildTraceEvent(currentTraceFields)]);

  return {
    traceId,
    id: traceId,
    environment: traceContext.environment,
    observation: (observationOptions: LangfuseObservationOptions) =>
      createObservation(traceContext, observationOptions),
    update: async (updates: Partial<LangfuseTraceOptions>) => {
      currentTraceFields = {
        ...currentTraceFields,
        ...updates,
        environment: traceContext.environment,
      };
      await sendIngestionEvents([buildTraceEvent(currentTraceFields)]);
    },
  };
}

export async function createObservation(
  trace: LangfuseTraceContext | undefined,
  options: LangfuseObservationOptions,
): Promise<void> {
  if (!langfuseClient || !trace) {
    return;
  }

  const timestamp = new Date().toISOString();
  const observationId = randomUUID();
  const observationEvent: LangfuseIngestionEvent = {
    type: "span-create",
    id: randomUUID(),
    timestamp,
    body: {
      id: observationId,
      traceId: trace.traceId,
      name: options.name,
      input: options.input,
      output: options.output,
      metadata: options.metadata,
      environment: trace.environment,
      level: options.level,
      statusMessage: options.statusMessage,
      version: options.version,
      startTime: options.startTime ?? timestamp,
      endTime: options.endTime ?? timestamp,
    },
  };

  await sendIngestionEvents([observationEvent]);
}

async function sendIngestionEvents(
  events: LangfuseIngestionEvent[],
): Promise<void> {
  if (!langfuseClient || !ingestionEnabled) {
    return;
  }

  try {
    await langfuseClient.api.ingestion.batch({
      batch: events,
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 401) {
      ingestionEnabled = false;
      console.warn(
        "[langfuse] disabled tracing because Langfuse ingestion is unauthorized",
      );
    }
    console.error("[langfuse] failed to emit events", err);
  }
}

export const langfuse = {
  client: langfuseClient,
  trace: createTrace,
  createObservation,
};

export function observe<T>(handler: T): T {
  return handler;
}

export function updateActiveTrace(): void {
  /* no-op */
}

export function updateActiveObservation(): void {
  /* no-op */
}

export const telemetry = {
  isConfigured: () => isLangfuseConfigured,
  isTraceActive: () => false,
};
