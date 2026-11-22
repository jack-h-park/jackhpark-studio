import { setTimeout as wait } from "node:timers/promises";

import {
  CHAT_TRAFFIC_RESPONSE_HEADER,
  SYNTHETIC_TRAFFIC_HEADER,
} from "@/lib/server/api/chat-traffic";

/**
 * Marks a chat request as synthetic when SYNTHETIC_TRAFFIC_TOKEN is set, so
 * the server labels the owner notice and leaves the request out of visitor
 * metrics. Without the token the request counts as a visitor.
 */
export function syntheticTrafficHeaders(): Record<string, string> {
  const token = process.env.SYNTHETIC_TRAFFIC_TOKEN?.trim();
  return token ? { [SYNTHETIC_TRAFFIC_HEADER]: token } : {};
}

/** Prints how the server classified the request (see X-Chat-Traffic). */
export function logChatTraffic(prefix: string, response: Response): void {
  const traffic = response.headers.get(CHAT_TRAFFIC_RESPONSE_HEADER);
  const sentToken = Object.keys(syntheticTrafficHeaders()).length > 0;
  if (sentToken && traffic !== "synthetic") {
    console.warn(
      `${prefix} WARNING: sent SYNTHETIC_TRAFFIC_TOKEN but the server classified the request as ${traffic ?? "unknown"}; the token does not match the server's.`,
    );
    return;
  }
  console.log(`${prefix} traffic=${traffic ?? "unknown"}`);
}

export function parseEnvFlag(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name];
  if (rawValue == null) {
    return fallback;
  }
  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function parseExpectation(name: string): boolean | null {
  const rawValue = process.env[name];
  if (rawValue == null) {
    return null;
  }
  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return null;
}

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export async function withAbortTimeout<T>(
  timeoutMs: number,
  action: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  // The timer gets its own controller so settling `action` can cancel it;
  // otherwise every call would wait out the full `timeoutMs`.
  const timerController = new AbortController();
  const timeout = wait(timeoutMs, undefined, {
    signal: timerController.signal,
  }).then(
    () => controller.abort(),
    () => undefined,
  );
  try {
    return await action(controller.signal);
  } finally {
    timerController.abort();
    controller.abort();
    await timeout;
  }
}

export async function runSmokeCase<T>(
  prefix: string,
  name: string,
  runner: () => Promise<T>,
): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  try {
    const result = await runner();
    console.log(`[${prefix}] PASS ${name}`);
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${prefix}] FAIL ${name}: ${message}`);
    return { ok: false, error: `${name}: ${message}` };
  }
}
