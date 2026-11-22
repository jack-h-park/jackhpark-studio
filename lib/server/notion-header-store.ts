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

function requestContext() {
  const context = (globalThis as Record<symbol, unknown>)[
    Symbol.for("@vercel/request-context")
  ] as
    | {
        get?: () => {
          cache?: Partial<Record<"get" | "set" | "expireTag", unknown>>;
        };
      }
    | undefined;
  return context?.get?.();
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
      // Keep the header KV invalidation on the Runtime Cache API. CDN chat
      // invalidation is a separate operation after marker retention is verified.
      // A purge-only context can still use a process-local SDK fallback, whose
      // read-after-write is not proof of shared invalidation. Fail closed.
      const context = requestContext();
      if (
        typeof context?.cache?.get !== "function" ||
        typeof context.cache.set !== "function" ||
        typeof context.cache.expireTag !== "function"
      )
        throw new NotionHeaderCacheError("runtime_cache_context_unavailable");
      await (await runtimeHeaderCache()).expireTag(headerTag);
    },
    diagnostics: () => ({
      // Read in the active request scope; never inspect cache endpoints/headers.
      backend: requestContext()?.cache ? "request-context" : "sdk-fallback",
      invalidation: "runtime-expire-tag",
    }),
  };
}
