import fs from "node:fs";
import path from "node:path";

import { type ExtendedRecordMap } from "notion-types";
import { getAllPagesInSpace, getPageProperty, uuidToId } from "notion-utils";
import pMemoize from "p-memoize";

import type * as types from "./types";
import * as config from "./config";
import { includeNotionIdInUrls } from "./config";
import { getCanonicalPageId } from "./get-canonical-page-id";
import { notion } from "./notion-api";

// ---------------------------------------------------------------------------
// Disk-based sitemap cache
// Persists the sitemap across dev-server restarts so every restart does not
// hammer the Notion API and exhaust its rate limits.
// Cache is stored in .next/cache/notion-sitemap.json.
// TTL: 5 minutes in development, 60 minutes in production.
// ---------------------------------------------------------------------------
const SITEMAP_CACHE_PATH = path.join(
  process.cwd(),
  ".next",
  "cache",
  "notion-sitemap.json",
);
const SITEMAP_TTL_MS =
  process.env.NODE_ENV === "production" ? 60 * 60 * 1000 : 5 * 60 * 1000;

function readSitemapCache(): Partial<types.SiteMap> | null {
  try {
    const raw = fs.readFileSync(SITEMAP_CACHE_PATH, "utf8");
    const { ts, data } = JSON.parse(raw) as {
      ts: number;
      data: Partial<types.SiteMap>;
    };
    if (Date.now() - ts < SITEMAP_TTL_MS) {
      return data;
    }
  } catch {
    // cache miss or parse error — fall through
  }
  return null;
}

function writeSitemapCache(data: Partial<types.SiteMap>): void {
  try {
    fs.mkdirSync(path.dirname(SITEMAP_CACHE_PATH), { recursive: true });
    fs.writeFileSync(
      SITEMAP_CACHE_PATH,
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch (err) {
    console.warn("[sitemap cache] write failed", err);
  }
}

const uuid = !!includeNotionIdInUrls;

export async function getSiteMap(): Promise<types.SiteMap> {
  const partialSiteMap = await getAllPages(
    config.rootNotionPageId,
    config.rootNotionSpaceId ?? undefined,
  );

  return {
    site: config.site,
    ...partialSiteMap,
  } as types.SiteMap;
}

const getAllPages = pMemoize(getAllPagesImpl, {
  cacheKey: (...args) => JSON.stringify(args),
});

// notion-utils' getAllPagesInSpace reads block[id].value.type to find sub-pages,
// but this project's Notion API returns a double-nested structure:
//   block[id] = { spaceId, value: { value: { id, type, ... } } }
// Normalize blocks to the standard single-nested format so traversal works.
function normalizeBlocksForTraversal(
  recordMap: ExtendedRecordMap,
): ExtendedRecordMap {
  const normalizedBlocks: ExtendedRecordMap["block"] = {};
  for (const [id, raw] of Object.entries(recordMap.block ?? {})) {
    const outer = (raw as any)?.value;
    const isDoubleNested =
      outer &&
      typeof outer === "object" &&
      "value" in outer &&
      outer.value &&
      typeof outer.value === "object" &&
      (outer.value.id || outer.value.type || outer.value.parent_id);
    normalizedBlocks[id] = isDoubleNested
      ? ({ value: outer.value } as any)
      : raw;
  }
  return { ...recordMap, block: normalizedBlocks };
}

// Notion's v3 API returns collection_view entries double-nested
// ({ value: { value, role } }), so unwrap before reading view fields.
function unwrapValue<T>(raw: unknown): T | null {
  const outer = (raw as { value?: unknown } | null)?.value;
  if (outer && typeof outer === "object" && "value" in outer) {
    const inner = (outer as { value?: unknown }).value;
    if (inner && typeof inner === "object") return inner as T;
  }
  return (outer as T) ?? null;
}

// Mirrors lib/notion.ts resolveCollectionDataId: collections copied from
// another collection must be queried via their parent collection id.
function resolveCollectionDataId(
  recordMap: ExtendedRecordMap,
  collectionId: string,
): string {
  const value = unwrapValue<{ parent_table?: string; parent_id?: string }>(
    recordMap.collection?.[collectionId],
  );
  if (value?.parent_table === "collection" && value.parent_id) {
    return value.parent_id;
  }
  return collectionId;
}

// Notion 429s even at concurrency 1 once a sitemap crawl exceeds a few dozen
// pages; skipped pages silently fall back to UUID URLs, so retry with backoff
// instead of dropping them.
async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 5;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt + 1 >= maxAttempts || !message.includes("429")) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 2000 * 2 ** attempt),
      );
    }
  }
}

// The double-nested collection_view shape (above) also breaks notion-client's
// own fetchCollections pass: it cannot read collection_id off the view, never
// issues queryCollection, and collection_query stays empty — so
// getAllPagesInSpace never discovers inline-database items and they fall back
// to UUID URLs. Query each view once and merge the returned item page blocks
// into recordMap.block, which is enough for traversal to descend into them.
async function hydrateCollectionPageBlocks(
  recordMap: ExtendedRecordMap,
): Promise<ExtendedRecordMap> {
  for (const [viewId, rawView] of Object.entries(
    recordMap.collection_view ?? {},
  )) {
    const view = unwrapValue<{
      collection_id?: string;
      format?: Record<string, unknown> & {
        collection_pointer?: { id?: string };
      };
    }>(rawView);
    const collectionId =
      view?.collection_id ?? view?.format?.collection_pointer?.id;
    if (!collectionId) continue;

    // Grouped views 400 when queried with their grouping metadata intact
    // (queryCollection expects per-group reducers). The sitemap only needs the
    // flat item list, so strip grouping and query ungrouped.
    const {
      collection_group_by: _cgb,
      collection_groups: _cg,
      board_columns: _bc,
      board_columns_by: _bcb,
      ...flatFormat
    } = view?.format ?? {};
    const flatView = { ...view, format: flatFormat };

    try {
      const data = await withRateLimitRetry(() =>
        notion.getCollectionData(
          resolveCollectionDataId(recordMap, collectionId),
          viewId,
          flatView,
          { limit: 999 },
        ),
      );
      const blocks = data.recordMap?.block;
      for (const [id, block] of Object.entries(blocks ?? {})) {
        recordMap.block[id] ??= block;
      }
    } catch (err) {
      // A failed view query only loses slug coverage for that collection's
      // items (they fall back to UUID URLs); don't abort sitemap generation.
      console.warn(
        `[sitemap] collection query failed (view ${viewId}, collection ${collectionId})`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return recordMap;
}

// Lightweight page fetch for sitemap traversal only.
//
// bdb1b51 switched this to the full lib/notion.ts getPage so that
// hydrateGroupedCollectionData would run and populate collection_query,
// which is required for getAllPagesInSpace to discover collection items.
// However, the full getPage also fetches preview images, tweets, navigation
// links, relation pages, etc. — multiplying API calls 5-10× per page and
// reliably triggering Notion's 429 rate limit.
//
// Fix: use notion.getPage() plus hydrateCollectionPageBlocks (one
// queryCollection call per collection view — enough for traversal to discover
// collection items) and skip every extra step that is only needed for page
// rendering, not for sitemap discovery.
const getPage = async (pageId: string) => {
  const recordMap = await withRateLimitRetry(() =>
    notion.getPage(pageId, {
      fetchCollections: true,
      fetchMissingBlocks: false,
      fetchRelationPages: false,
      ofetchOptions: { timeout: 30_000 },
    }),
  );
  await hydrateCollectionPageBlocks(recordMap);
  return normalizeBlocksForTraversal(recordMap);
};

async function getAllPagesImpl(
  rootNotionPageId: string,
  rootNotionSpaceId?: string,
): Promise<Partial<types.SiteMap>> {
  const cached = readSitemapCache();
  if (cached) {
    console.log("[sitemap cache] hit — skipping Notion API fetch");
    return cached;
  }

  // concurrency: 1 to avoid hammering the unofficial Notion API with parallel
  // requests and triggering 429 rate limits.
  const pageMap = await getAllPagesInSpace(
    rootNotionPageId,
    rootNotionSpaceId,
    getPage,
    { concurrency: 1 },
  );

  const canonicalPageMap = Object.keys(pageMap).reduce(
    (map: Record<string, string>, pageId: string) => {
      const recordMap = pageMap[pageId];
      if (!recordMap) {
        // Page failed to load (e.g. Notion API 429 rate limit). Skip rather
        // than aborting sitemap generation entirely.
        console.warn(`Skipping page "${pageId}" — recordMap unavailable`);
        return map;
      }

      const block = recordMap.block[pageId]?.value;
      if (
        !(getPageProperty<boolean | null>("Public", block!, recordMap) ?? true)
      ) {
        return map;
      }

      const canonicalPageId = getCanonicalPageId(pageId, recordMap, {
        uuid,
      })!;

      if (map[canonicalPageId]) {
        // Two pages with the same title slugify to the same canonical id.
        // Disambiguate with a short id suffix instead of dropping the page
        // (a dropped page would fall back to a UUID URL).
        const suffixed = `${canonicalPageId}-${uuidToId(pageId).slice(0, 8)}`;
        console.warn("duplicate canonical page id — disambiguating", {
          canonicalPageId,
          suffixed,
          pageId,
          existingPageId: map[canonicalPageId],
        });

        return {
          ...map,
          [suffixed]: pageId,
        };
      } else {
        return {
          ...map,
          [canonicalPageId]: pageId,
        };
      }
    },
    {},
  );

  const result = { pageMap, canonicalPageMap };
  writeSitemapCache(result);
  return result;
}
