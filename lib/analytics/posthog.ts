import { PostHog } from "posthog-node";

import { telemetryLogger } from "@/lib/logging/logger";
import { isTelemetryEnabled } from "@/lib/server/telemetry/telemetry-enabled";

const posthogApiKey = process.env.POSTHOG_API_KEY;
const posthogHost = process.env.POSTHOG_HOST ?? "https://app.posthog.com";

const isDevEnvironment = process.env.NODE_ENV !== "production";
let didLogPostHogInit = false;
let didLogPostHogFirstSuccess = false;

const telemetryEnabled = isTelemetryEnabled();

const posthogClient =
  telemetryEnabled && posthogApiKey
    ? new PostHog(posthogApiKey, {
        host: posthogHost,
      })
    : null;

function logPosthogInit(): void {
  if (!isDevEnvironment || didLogPostHogInit) {
    return;
  }

  didLogPostHogInit = true;

  if (!telemetryEnabled) {
    telemetryLogger.debug("[posthog] disabled (TELEMETRY_ENABLED=false)");
    return;
  }

  telemetryLogger.debug("[posthog] wiring status", {
    provider: "posthog",
    enabled: Boolean(posthogClient),
    host: posthogHost,
  });
}

logPosthogInit();

export function isPostHogEnabled(): boolean {
  return telemetryEnabled && Boolean(posthogClient);
}

export function captureChatCompletion(options: {
  distinctId: string;
  properties: Record<string, unknown>;
}): void {
  if (!telemetryEnabled || !posthogClient) {
    return;
  }

  const normalizedDistinctId = options.distinctId?.trim();
  if (!normalizedDistinctId) {
    return;
  }

  try {
    posthogClient.capture({
      distinctId: normalizedDistinctId,
      event: "chat_completion",
      properties: options.properties,
    });

    if (isDevEnvironment && !didLogPostHogFirstSuccess) {
      telemetryLogger.debug("[posthog] capture ok", {
        event: "chat_completion",
        status: options.properties?.status,
        preset_key: options.properties?.preset_key,
      });
      didLogPostHogFirstSuccess = true;
    }
  } catch (err: unknown) {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const errorMessage =
      err instanceof Error ? err.message : String(err ?? "unknown error");
    telemetryLogger.debug("[posthog] capture failed", {
      event: "chat_completion",
      error: errorMessage,
    });
  }
}

export function classifyChatCompletionError(error: unknown): string {
  const normalizedMessage =
    error instanceof Error
      ? error.message.toLowerCase()
      : (typeof error === "string" ? error : String(error ?? "")).toLowerCase();

  if (normalizedMessage.includes("timeout")) {
    return "timeout";
  }
  if (
    normalizedMessage.includes("unauthor") ||
    normalizedMessage.includes("401")
  ) {
    return "unauthorized";
  }
  if (
    normalizedMessage.includes("no models loaded") ||
    normalizedMessage.includes("connection refused")
  ) {
    return "local_llm_unavailable";
  }
  if (normalizedMessage.includes("local_llm_unavailable")) {
    return "local_llm_unavailable";
  }
  if (normalizedMessage.includes("network")) {
    return "network_error";
  }
  return "upstream_error";
}
