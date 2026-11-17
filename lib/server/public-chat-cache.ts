import { addCacheTag, invalidateByTag } from "@vercel/functions";

import { NotionHeaderCacheError } from "@/lib/server/notion-header-error";

export const PUBLIC_CHAT_CACHE_TAG = "public-chat-shell-v1";
export const PUBLIC_CHAT_CDN_TTL_SECONDS = 900;
export const PUBLIC_CHAT_SWR_SECONDS = 60;

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
      return false;
    await addCacheTag(PUBLIC_CHAT_CACHE_TAG);
    return true;
  } catch {
    // Keep serving the page, but never publish an unconfirmed shared entry.
    return false;
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
