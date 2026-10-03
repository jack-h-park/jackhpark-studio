import { invalidateByTag } from "@vercel/functions";

export const PUBLIC_CHAT_CACHE_TAG = "public-chat-shell-v1";
export const PUBLIC_CHAT_CDN_TTL_SECONDS = 900;
export const PUBLIC_CHAT_SWR_SECONDS = 60;

export async function invalidatePublicChatShell(): Promise<
  "invalidated" | "skipped-local"
> {
  if (process.env.VERCEL !== "1") return "skipped-local";

  // SWR invalidation can serve one stale response before refreshing. The SDK
  // can also resolve without purge context; effectiveness needs live proof.
  await invalidateByTag(PUBLIC_CHAT_CACHE_TAG);
  return "invalidated";
}
