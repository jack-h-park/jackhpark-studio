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
  const timeout = wait(timeoutMs).then(() => controller.abort());
  try {
    return await action(controller.signal);
  } finally {
    controller.abort();
    await timeout.catch(() => undefined);
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
