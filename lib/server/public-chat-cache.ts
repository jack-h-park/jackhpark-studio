import { addCacheTag, invalidateByTag } from "@vercel/functions";

import { notionLogger } from "@/lib/logging/logger";
import { NotionHeaderCacheError } from "@/lib/server/notion-header-error";

export const PUBLIC_CHAT_CACHE_TAG = "public-chat-shell-v1";
export const PUBLIC_CHAT_CDN_TTL_SECONDS = 900;
export const PUBLIC_CHAT_SWR_SECONDS = 60;
export const PUBLIC_CHAT_TAG_REGISTRATION_TIMEOUT_MS = 500;

type TagRegistrationFailure =
  | "capability_unavailable"
  | "sdk_rejected"
  | "deadline_exceeded";
const lastDiagnosticAt = new Map<TagRegistrationFailure, number>();

function registrationFailed(reason: TagRegistrationFailure): false {
  const now = Date.now();
  const previous = lastDiagnosticAt.get(reason);
  // Bound diagnostics only. Never memoize a request-scoped capability failure.
  if (previous === undefined || now - previous >= 60_000) {
    lastDiagnosticAt.set(reason, now);
    try {
      notionLogger.error("public_chat_tag_registration_unconfirmed", {
        reason,
        sharedCache: "disabled",
        deadlineMs: PUBLIC_CHAT_TAG_REGISTRATION_TIMEOUT_MS,
      });
    } catch {
      // Optional diagnostics cannot prevent the private response fallback.
    }
  }
  return false;
}

export type PublicChatCacheInvalidation =
  | "invalidation-requested"
  | "skipped-local";

export async function registerPublicChatCacheTag(): Promise<boolean> {
  if (process.env.VERCEL !== "1") return true;
  try {
    const context = (globalThis as Record<symbol, unknown>)[
      Symbol.for("@vercel/request-context")
    ] as { get?: () => { addCacheTag?: unknown } } | undefined;
    // The SDK silently resolves without this capability. Observed Production
    // request metadata lacked the shell tag despite its response-header setup.
    if (
      typeof context?.get !== "function" ||
      typeof context.get()?.addCacheTag !== "function"
    )
      return registrationFailed("capability_unavailable");
  } catch {
    return registrationFailed("capability_unavailable");
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await new Promise<"registered" | TagRegistrationFailure>(
      (resolve) => {
        timer = setTimeout(
          () => resolve("deadline_exceeded"),
          PUBLIC_CHAT_TAG_REGISTRATION_TIMEOUT_MS,
        );
        try {
          // Both handlers remain attached after a deadline: late SDK settlement
          // neither becomes an unhandled rejection nor changes cache eligibility.
          Promise.resolve(addCacheTag(PUBLIC_CHAT_CACHE_TAG)).then(
            () => resolve("registered"),
            () => resolve("sdk_rejected"),
          );
        } catch {
          resolve("sdk_rejected");
        }
      },
    );
    return outcome === "registered" ? true : registrationFailed(outcome);
  } finally {
    clearTimeout(timer);
  }
}

export async function invalidatePublicChatShell(): Promise<PublicChatCacheInvalidation> {
  if (process.env.VERCEL !== "1") return "skipped-local";

  let available = false;
  try {
    const context = (globalThis as Record<symbol, unknown>)[
      Symbol.for("@vercel/request-context")
    ] as { get?: () => { purge?: { invalidateByTag?: unknown } } } | undefined;
    available =
      typeof context?.get === "function" &&
      typeof context.get()?.purge?.invalidateByTag === "function";
  } catch {
    // Context lookup failures are capability failures, not provider diagnostics.
  }
  if (!available) throw new NotionHeaderCacheError("purge_context_unavailable");

  try {
    // The installed SDK silently succeeds without this request capability.
    // Acknowledgement requests SWR; it does not prove completed CDN propagation.
    await invalidateByTag(PUBLIC_CHAT_CACHE_TAG);
  } catch {
    throw new NotionHeaderCacheError("purge_failed");
  }
  return "invalidation-requested";
}
