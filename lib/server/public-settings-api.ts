import type { NextApiRequest, NextApiResponse } from "next";

import { loadChatModelSettings } from "./chat-settings";
import { PUBLIC_CHAT_CACHE_TAG } from "./public-chat-cache";

let pending: ReturnType<typeof loadChatModelSettings> | null = null;

export async function loadPublicSettings() {
  if (pending) return pending;
  // Cache only the HTTP response, not origin data: a cache invalidation must
  // never republish an indefinitely cached admin configuration.
  const read = loadChatModelSettings({ forceRefresh: true });
  pending = read;
  try {
    return await read;
  } finally {
    if (pending === read) pending = null;
  }
}

export function cachePublicSettingsResponse(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (
    req.headers.authorization ||
    Object.keys(req.query ?? {}).length > 0 ||
    res.hasHeader("Set-Cookie") ||
    res.statusCode !== 200
  )
    return;
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
  // The existing admin-save invalidation refreshes this response too.
  res.setHeader("Vercel-Cache-Tag", PUBLIC_CHAT_CACHE_TAG);
}
