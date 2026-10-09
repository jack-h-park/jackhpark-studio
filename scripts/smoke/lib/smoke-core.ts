import { setTimeout as wait } from "node:timers/promises";

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
