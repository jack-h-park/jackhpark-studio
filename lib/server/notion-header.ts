import { randomUUID } from "node:crypto";

import type { ExtendedRecordMap } from "notion-types";
import { parsePageId } from "notion-utils";

import {
  domain,
  environment,
  isRedisEnabled,
  rootNotionPageId,
} from "@/lib/config";
import { withRateLimitRetry } from "@/lib/notion-rate-limit";
import { unwrapRecordValue } from "@/lib/rag/notion-record-value";
import { createRuntimeHeaderStore } from "@/lib/server/notion-header-store";

export type NotionNavigationHeader = {
  headerRecordMap: ExtendedRecordMap | null;
  headerBlockId: string;
};

const HEADER_TTL_MS = 3_600_000;

function createMemoryHeaderLoader({
  fetchRoot,
  now,
}: {
  fetchRoot(pageId: string): Promise<ExtendedRecordMap>;
  now(): number;
}): () => Promise<NotionNavigationHeader> {
  const canonicalRootPageId =
    parsePageId(rootNotionPageId, { uuid: true }) ?? rootNotionPageId;
  const normalizedRootPageId = canonicalRootPageId.replaceAll("-", "");

  let cachedHeader: NotionNavigationHeader | null = null;
  let expiresAt = 0;
  let inFlight: Promise<NotionNavigationHeader> | null = null;

  return async () => {
    if (cachedHeader && now() < expiresAt) return cachedHeader;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const recordMap = await withRateLimitRetry(() =>
          fetchRoot(canonicalRootPageId),
        );
        const rawBlockEntry =
          recordMap.block?.[canonicalRootPageId] ??
          recordMap.block?.[normalizedRootPageId] ??
          recordMap.block?.[rootNotionPageId];

        if (rawBlockEntry) {
          const normalizedValue = unwrapRecordValue<{ id?: string }>(
            rawBlockEntry,
          );
          const blockEntry = {
            ...rawBlockEntry,
            value: {
              ...normalizedValue,
              id: normalizedValue?.id ?? canonicalRootPageId,
            },
          } as typeof rawBlockEntry;

          cachedHeader = {
            headerRecordMap: {
              block: {
                [canonicalRootPageId]: blockEntry,
                [normalizedRootPageId]: blockEntry,
              },
              collection: {},
              collection_query: {},
              collection_view: {},
              notion_user: {},
              signed_urls: {},
            },
            headerBlockId: canonicalRootPageId,
          };
          // Reads never extend the deadline; only successful fetches start an hour.
          expiresAt = now() + HEADER_TTL_MS;
          return cachedHeader;
        }
      } catch {
        // A failed read leaves no fresh cache entry, so the next call can recover.
      }

      return {
        headerRecordMap: null,
        headerBlockId: canonicalRootPageId,
      };
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  };
}

export interface NotionHeaderStore {
  get(key: string): Promise<unknown>;
  invalidate?(): Promise<void>;
  set(key: string, value: unknown, ttl?: number): Promise<unknown>;
}

type HeaderLoader = (() => Promise<NotionNavigationHeader>) & {
  invalidate(): Promise<void>;
};
const MAX_HEADER_BYTES = 65_536;

export function createNotionNavigationHeaderLoader(options: {
  fetchRoot(pageId: string): Promise<ExtendedRecordMap>;
  now(): number;
  store?: NotionHeaderStore;
  cacheKey?: string;
}): HeaderLoader {
  let local = createMemoryHeaderLoader(options);
  const { store } = options;
  const key =
    options.cacheKey ??
    `notion-header:v1:${domain}:${process.env.VERCEL_ENV ?? environment}:${rootNotionPageId}`;
  const revisionKey = `${key}:revision`;
  const rootId =
    parsePageId(rootNotionPageId, { uuid: true }) ?? rootNotionPageId;
  const empty = (): NotionNavigationHeader => ({
    headerRecordMap: null,
    headerBlockId: rootId,
  });
  let pending: {
    revision: string;
    read: Promise<NotionNavigationHeader>;
  } | null = null;

  async function revision(): Promise<string> {
    const value = await store!.get(revisionKey);
    if (value === undefined || value === null) {
      // Runtime Cache may evict markers independently of entries. A new random
      // generation prevents a surviving older entry from becoming current again.
      const fresh = randomUUID();
      await store!.set(revisionKey, fresh);
      if ((await store!.get(revisionKey)) !== fresh) {
        throw new Error("Header cache revision was not retained");
      }
      return fresh;
    }
    if (typeof value !== "string" || value.length > 128)
      throw new Error("Invalid header revision");
    return value;
  }

  async function readRevision(
    current: string,
  ): Promise<NotionNavigationHeader> {
    const entryKey = `${key}:${current}`;
    try {
      const raw = await store!.get(entryKey);
      if (
        raw &&
        typeof raw === "object" &&
        Buffer.byteLength(JSON.stringify(raw), "utf8") <= MAX_HEADER_BYTES
      ) {
        const entry = raw as {
          expiresAt?: unknown;
          header?: NotionNavigationHeader;
        };
        if (
          typeof entry.expiresAt === "number" &&
          Number.isFinite(entry.expiresAt) &&
          entry.expiresAt > options.now() &&
          entry.expiresAt <= options.now() + HEADER_TTL_MS &&
          entry.header?.headerBlockId === rootId &&
          entry.header.headerRecordMap?.block?.[rootId]?.value?.id === rootId
        ) {
          // Re-project persisted data: never trust extra tables/blocks from a store entry.
          return createMemoryHeaderLoader({
            ...options,
            fetchRoot: async () => entry.header!.headerRecordMap!,
          })();
        }
      }
    } catch {
      // Store outages/malformed entries must not prevent a fresh origin read.
    }
    const header = await createMemoryHeaderLoader(options)();
    if (header.headerRecordMap) {
      const entry = { expiresAt: options.now() + HEADER_TTL_MS, header };
      if (
        Buffer.byteLength(JSON.stringify(entry), "utf8") <= MAX_HEADER_BYTES
      ) {
        try {
          await store!.set(entryKey, entry, HEADER_TTL_MS);
        } catch {
          /* Origin success remains usable. */
        }
      }
    }
    return header;
  }

  const load = async (): Promise<NotionNavigationHeader> => {
    if (!store) return local();
    // A bounded retry observes invalidation during a read without following
    // endlessly changing revisions. No old fill can write the current key.
    for (let attempt = 0; attempt < 2; attempt++) {
      let current: string;
      try {
        current = await revision();
      } catch {
        return createMemoryHeaderLoader(options)();
      }
      if (!pending || pending.revision !== current)
        pending = { revision: current, read: readRevision(current) };
      const active = pending;
      let header: NotionNavigationHeader;
      try {
        header = await active.read;
      } finally {
        if (pending === active) pending = null;
      }
      try {
        if ((await revision()) !== current) continue;
      } catch {
        return empty();
      }
      return header;
    }
    return empty();
  };
  return Object.assign(load, {
    async invalidate() {
      // The revision has no TTL: expiration must never resurrect an old generation.
      if (store) {
        await store.invalidate?.();
        const fresh = randomUUID();
        await store.set(revisionKey, fresh);
        if ((await store.get(revisionKey)) !== fresh) {
          throw new Error("Header cache revision was not retained");
        }
      }
      local = createMemoryHeaderLoader(options);
      pending = null;
    },
  });
}

const defaultLoader = createNotionNavigationHeaderLoader({
  fetchRoot: async (pageId) => {
    const { notion } = await import("@/lib/notion-api");
    return notion.getPage(pageId, {
      chunkLimit: 1,
      fetchCollections: false,
      fetchMissingBlocks: false,
      fetchRelationPages: false,
      signFileUrls: false,
    });
  },
  now: () => Date.now(),
  store: isRedisEnabled
    ? {
        get: async (key) => (await import("@/lib/db")).db.get(key),
        set: async (key, value, ttl) =>
          (await import("@/lib/db")).db.set(key, value, ttl),
      }
    : process.env.VERCEL === "1"
      ? createRuntimeHeaderStore()
      : undefined,
});

export async function loadNotionNavigationHeader(): Promise<NotionNavigationHeader> {
  return defaultLoader();
}

export async function invalidateNotionNavigationHeader(): Promise<void> {
  await defaultLoader.invalidate();
}
