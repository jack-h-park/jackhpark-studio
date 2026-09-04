/**
 * Helpers for reading a caught value without asserting what was thrown.
 *
 * `catch (err: any)` then `err.message` was the pattern these replace. It reads
 * as safe but is not: JavaScript can throw anything, so on a thrown string the
 * log line meant to explain the failure silently says `undefined`.
 *
 * These are for log-and-report call sites. Where an error is rethrown or its
 * type actually matters, narrow it properly instead.
 */

/**
 * The value's own message, when it has a usable one.
 *
 * Not every thrown value with a message is an `Error`: Supabase surfaces
 * `PostgrestError` as a plain `{ message }` object, and dropping those in
 * favour of an `instanceof Error` check would throw away the only useful part
 * of the failure.
 */
export function errorMessageOrUndefined(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;

  if (err !== null && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }

  return undefined;
}

/** A message that is always printable, falling back to the value itself. */
export function errorMessage(err: unknown): string {
  return errorMessageOrUndefined(err) ?? String(err);
}

/**
 * True when a caught value is an abort, whatever concrete class it came from.
 * Aborts arrive as a DOMException in some runtimes and a plain Error in others,
 * so the name is the only portable signal.
 */
export function isAbortError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    (err as { name?: unknown }).name === "AbortError"
  );
}
