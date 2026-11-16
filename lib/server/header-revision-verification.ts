import {
  type HeaderRevisionVerification,
  type HeaderStoreDiagnostics,
  NotionHeaderCacheError,
} from "@/lib/server/notion-header-error";

export async function verifyHeaderRevision({
  read,
  expected,
  previous,
  wait,
  store,
}: {
  read(): Promise<unknown>;
  expected: string;
  previous: unknown;
  store?: HeaderStoreDiagnostics;
  wait(ms: number): Promise<void>;
}): Promise<HeaderRevisionVerification> {
  const verification: HeaderRevisionVerification = {
    ...(store ? { store } : {}),
    attempts: 0,
    missing: 0,
    previous: 0,
    different: 0,
    invalid: 0,
    waitedMs: 0,
  };
  // Read-only, finite verification: never overwrite a possibly newer writer.
  // A missing value alone cannot prove whether a write failed or is delayed.
  for (const delay of [0, 100, 250]) {
    if (delay) {
      await wait(delay);
      verification.waitedMs += delay;
    }
    verification.attempts++;
    let value: unknown;
    try {
      value = await read();
    } catch {
      throw new NotionHeaderCacheError("revision_read_failed", verification);
    }
    if (value === expected) return verification;
    if (value === undefined || value === null) verification.missing++;
    else if (typeof value !== "string" || value.length > 128)
      verification.invalid++;
    else if (value === previous) verification.previous++;
    else verification.different++;
  }
  throw new NotionHeaderCacheError(
    verification.different ? "revision_changed" : "revision_not_retained",
    verification,
  );
}
