import { createHash } from "node:crypto";

import type { NotionHeaderStore } from "@/lib/server/notion-header";
import { domain, environment } from "@/lib/config";
import { NotionHeaderCacheError } from "@/lib/server/notion-header-error";

const headerTag = `${domain}:${process.env.VERCEL_ENV ?? environment}:notion-header:v1`;

// Built-in Runtime Cache needs no Redis subscription or environment secrets.
// The project/domain scope is explicit because Hobby teams share cache storage.
async function runtimeHeaderCache() {
  const { getCache } = await import("@vercel/functions");
  return getCache({
    namespace: "notion-header-v1",
    keyHashFunction: (key) => createHash("sha256").update(key).digest("hex"),
  });
}

export function createRuntimeHeaderStore(): NotionHeaderStore {
  return {
    get: async (key) => (await runtimeHeaderCache()).get(key),
    set: async (key, value, ttl) =>
      (await runtimeHeaderCache()).set(key, value, {
        ttl: ttl === undefined ? undefined : Math.ceil(ttl / 1000),
        tags: [headerTag],
      }),
    invalidate: async () => {
      // The installed SDK resolves silently without a platform purge context.
      // Guard its request-context capability before reporting a manual refresh.
      const context = (globalThis as Record<symbol, unknown>)[
        Symbol.for("@vercel/request-context")
      ] as { get?: () => { purge?: unknown } } | undefined;
      if (!context?.get?.()?.purge)
        throw new NotionHeaderCacheError("purge_context_unavailable");
      await (await import("@vercel/functions")).invalidateByTag(headerTag);
    },
  };
}
