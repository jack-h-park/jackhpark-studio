import { AsyncLocalStorage } from "node:async_hooks";

import {
  observe as langfuseObserve,
  updateActiveObservation as langfuseUpdateActiveObservation,
  updateActiveTrace as langfuseUpdateActiveTrace,
} from "@langfuse/tracing";

// Centralized Langfuse helpers for environment detection, sampling, and Next.js compatibility.

type ObserveOptions = Parameters<typeof langfuseObserve>[1];
type UpdateActiveTraceArgs = Parameters<typeof langfuseUpdateActiveTrace>[0];
type UpdateActiveObservationArgs = Parameters<
  typeof langfuseUpdateActiveObservation
>[0];

export type AppEnv = "dev" | "preview" | "prod";

// AsyncLocalStorage makes it easy to share the sampling decision within a single request.
const traceContext = new AsyncLocalStorage<boolean>();

const isLangfuseConfigured =
  Boolean(process.env.LANGFUSE_PUBLIC_KEY) &&
  Boolean(process.env.LANGFUSE_SECRET_KEY) &&
  Boolean(process.env.LANGFUSE_HOST);

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

  if (fromAppEnv === "dev" || fromAppEnv === "preview" || fromAppEnv === "prod") {
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

function getIsTraceActive(): boolean {
  return Boolean(traceContext.getStore());
}

export function observe<T extends (...args: any[]) => any>(
  handler: T,
  options?: ObserveOptions,
): T {
  if (!isLangfuseConfigured) {
    return handler;
  }

  const handlerWithContext = ((...args: Parameters<T>) => {
    return traceContext.run(true, () => handler(...args));
  }) as T;
  const tracedHandler = langfuseObserve(handlerWithContext, options);

  const fallbackHandler = ((...args: Parameters<T>) => {
    return traceContext.run(false, () => handler(...args));
  }) as T;

  const wrappedHandler = ((...args: Parameters<T>) => {
    const env = getAppEnv();
    const enabled = shouldTrace(env);

    if (!enabled) {
      return fallbackHandler(...args);
    }

    return tracedHandler(...args);
  }) as T;

  return wrappedHandler;
}

export function updateActiveTrace(
  args: UpdateActiveTraceArgs,
): ReturnType<typeof langfuseUpdateActiveTrace> | void {
  if (!isLangfuseConfigured || !getIsTraceActive()) {
    return;
  }

  return langfuseUpdateActiveTrace(args);
}

export function updateActiveObservation(
  args: UpdateActiveObservationArgs,
): ReturnType<typeof langfuseUpdateActiveObservation> | void {
  if (!isLangfuseConfigured || !getIsTraceActive()) {
    return;
  }

  return langfuseUpdateActiveObservation(args);
}

export const telemetry = {
  isConfigured: isLangfuseConfigured,
  isTraceActive: getIsTraceActive,
};
