import type { LangfuseClient } from "@langfuse/client";

import { getAppEnv } from "@/lib/app-env";
import { createOtelTrace } from "@/lib/server/telemetry/otel-trace-backend";

const TRACE_IMPORT = process.env.LANGFUSE_IMPORT_TRACE === "1";
const traceImport = (msg: string) =>
  TRACE_IMPORT && console.log(`[langfuse.import] ${msg}`);

type LangfuseConfig = {
  baseUrl: string;
  publicKey: string;
  secretKey: string;
  timeout: number;
};

const LEGACY_SAMPLE_RATE_ENVS = [
  "LANGFUSE_SAMPLE_RATE_DEV",
  "LANGFUSE_SAMPLE_RATE_PREVIEW",
  "LANGFUSE_SAMPLE_RATE_PROD",
] as const;

let langfuseClient: LangfuseClient | null = null;
let didLogLangfuseInit = false;
let langfuseInitPromise: Promise<LangfuseClient | null> | null = null;

function readLangfuseConfig(): LangfuseConfig | null {
  traceImport("langfuse:read-config");
  const baseUrl = process.env.LANGFUSE_BASE_URL;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const timeout = Number(process.env.LANGFUSE_TIMEOUT ?? 5);
  if (!baseUrl || !publicKey || !secretKey) {
    traceImport("langfuse:config-missing");
    return null;
  }
  return {
    baseUrl,
    publicKey,
    secretKey,
    timeout,
  };
}

async function buildLangfuseClient(
  config: LangfuseConfig,
): Promise<LangfuseClient> {
  traceImport("langfuse:import-client");
  const { LangfuseClient } = await import("@langfuse/client");
  traceImport("langfuse:client-imported");
  return new LangfuseClient({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
    timeout: config.timeout,
  });
}

async function logLangfuseInitStatus(): Promise<void> {
  if (didLogLangfuseInit) {
    return;
  }
  traceImport("langfuse:log-status");
  didLogLangfuseInit = true;
  if (process.env.NODE_ENV === "production") {
    return;
  }
  const { telemetryLogger } = await import("@/lib/logging/logger");
  telemetryLogger.debug("Langfuse telemetry wiring", {
    provider: "langfuse",
    hasPublicKey: Boolean(process.env.LANGFUSE_PUBLIC_KEY),
    hasSecretKey: Boolean(process.env.LANGFUSE_SECRET_KEY),
    baseUrl: process.env.LANGFUSE_BASE_URL ?? "(default)",
  });

  const deprecatedSamples = LEGACY_SAMPLE_RATE_ENVS.filter(
    (key) => process.env[key] != null,
  );
  if (deprecatedSamples.length > 0) {
    telemetryLogger.debug(
      "Langfuse sample rate vars are ignored; telemetry sampling is controlled via TELEMETRY_SAMPLE_RATE_*",
      { envVars: deprecatedSamples },
    );
  }
  traceImport("langfuse:log-status-done");
}

/**
 * The client no longer carries traces — those go out over OTLP via the span
 * processor registered in `instrumentation.ts`. It remains the transport for
 * the read and score APIs, and `createTrace` still gates on it because its
 * presence is what says Langfuse is configured at all.
 */
export async function ensureLangfuseClient(): Promise<LangfuseClient | null> {
  if (langfuseClient) {
    return langfuseClient;
  }
  if (langfuseInitPromise) {
    return langfuseInitPromise;
  }
  const config = readLangfuseConfig();
  if (!config) {
    return null;
  }
  langfuseInitPromise = (async () => {
    const client = await buildLangfuseClient(config);
    langfuseClient = client;
    await logLangfuseInitStatus();
    return client;
  })();
  const result = await langfuseInitPromise;
  langfuseInitPromise = null;
  return result;
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

export interface LangfuseTrace {
  traceId: string;
  id: string;
  environment: string;
  observation: (options: LangfuseObservationOptions) => Promise<void>;
  update: (options: Partial<LangfuseTraceOptions>) => Promise<void>;
  /**
   * Closes the root observation and exports it. Nothing reaches Langfuse until
   * this runs, and observations created afterwards are dropped rather than
   * orphaned, so the root must outlive every child.
   */
  end: () => void;
}

export function createTrace(
  options: LangfuseTraceOptions,
): LangfuseTrace | undefined {
  if (!langfuseClient) {
    return undefined;
  }
  return createOtelTrace(options, options.environment ?? getAppEnv());
}

export const langfuse = {
  get client() {
    return langfuseClient;
  },
  trace: createTrace,
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
  isConfigured: () => Boolean(readLangfuseConfig()),
  isTraceActive: () => false,
};

export { type AppEnv, getAppEnv } from "@/lib/app-env";
