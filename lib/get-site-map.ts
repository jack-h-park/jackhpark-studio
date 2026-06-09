import fs from "node:fs";
import path from "node:path";

import { type ExtendedRecordMap } from "notion-types";
import { getAllPagesInSpace, getPageProperty } from "notion-utils";
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
    const raw = fs.readFileSync(SITEMAP_CACHE_PATH, "utf-8");
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

// Lightweight page fetch for sitemap traversal only.
//
// bdb1b51 switched this to the full lib/notion.ts getPage so that
// hydrateGroupedCollectionData would run and populate collection_query,
// which is required for getAllPagesInSpace to discover collection items.
// However, the full getPage also fetches preview images, tweets, navigation
// links, relation pages, etc. — multiplying API calls 5-10× per page and
// reliably triggering Notion's 429 rate limit.
//
// Fix: use notion.getPage() with fetchCollections:true (enough to populate
// collection_query for traversal) and skip every extra step that is only
// needed for page rendering, not for sitemap discovery.
const getPage = async (pageId: string) => {
  const recordMap = await notion.getPage(pageId, {
    fetchCollections: true,
    fetchMissingBlocks: false,
    fetchRelationPages: false,
    ofetchOptions: { timeout: 30_000 },
  });
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
        // you can have multiple pages in different collections that have the same id
        // TODO: we may want to error if neither entry is a collection page
        console.warn("error duplicate canonical page id", {
          canonicalPageId,
          pageId,
          existingPageId: map[canonicalPageId],
        });

        return map;
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
