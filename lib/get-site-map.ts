import fs from "node:fs";
import path from "node:path";

import { type ExtendedRecordMap } from "notion-types";
import { getAllPagesInSpace, uuidToId } from "notion-utils";
import pMemoize from "p-memoize";

import type * as types from "./types";
import * as config from "./config";
import { includeNotionIdInUrls } from "./config";
import { getCanonicalPageId } from "./get-canonical-page-id";
import { notion } from "./notion-api";
import {
  getNotionPageIsPublic,
  normalizePropertyName,
  NOTION_IS_PUBLIC_PROPERTY,
} from "./rag/notion-metadata";
import {
  normalizeNotionRecordMap,
  unwrapRecordValue,
} from "./rag/notion-record-value";

// ---------------------------------------------------------------------------
// Disk-based sitemap cache (.next/cache/notion-sitemap.json)
//
// The crawl takes 3-5 minutes at concurrency 1 (150+ pages plus one
// queryCollection per collection view), so where it runs matters:
//
// - Production build: always crawl fresh, exactly once per build. Vercel
//   restores .next/cache across builds, so a TTL alone would silently reuse
//   the previous deploy's sitemap; instead the cache entry is stamped with a
//   per-deploy build id and only reused when it matches (which is also what
//   lets `next build`'s parallel getStaticProps workers share one crawl).
// - Production runtime: never crawl. The bundled cache is served regardless
//   of age — a multi-minute crawl inside a serverless function would exceed
//   maxDuration, and stale-until-next-deploy is the intended trade-off.
// - Development: 5-minute TTL, as before, so dev-server restarts don't
//   hammer the Notion API.
// ---------------------------------------------------------------------------
const SITEMAP_CACHE_PATH = path.join(
  process.cwd(),
  ".next",
  "cache",
  "notion-sitemap.json",
);
const SITEMAP_TTL_MS = 5 * 60 * 1000;

const isProdBuild =
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE === "phase-production-build";
const isProdRuntime = process.env.NODE_ENV === "production" && !isProdBuild;

// Unique per Vercel deploy (unlike the git SHA, it changes on same-commit
// redeploys, so a redeploy still picks up Notion content changes). Null for
// local `next build`, which falls back to the short TTL below.
const BUILD_ID = process.env.VERCEL_DEPLOYMENT_ID ?? null;

interface SitemapCacheEntry {
  ts: number;
  buildId?: string | null;
  data: Partial<types.SiteMap>;
}

function readSitemapCache(): Partial<types.SiteMap> | null {
  try {
    const raw = fs.readFileSync(SITEMAP_CACHE_PATH, "utf8");
    const { ts, buildId, data } = JSON.parse(raw) as SitemapCacheEntry;

    if (isProdRuntime) {
      // Bundled at build time; always valid (see header comment).
      return data;
    }

    if (isProdBuild && BUILD_ID) {
      // Reuse only within this deploy's build; entries restored from a
      // previous build must not skip the crawl.
      return buildId === BUILD_ID ? data : null;
    }

    // Development, and local prod builds where no deploy id exists to
    // distinguish "this build" from "a restored previous build".
    return Date.now() - ts < SITEMAP_TTL_MS ? data : null;
  } catch {
    // cache miss or parse error — fall through
    return null;
  }
}

function writeSitemapCache(data: Partial<types.SiteMap>): void {
  try {
    fs.mkdirSync(path.dirname(SITEMAP_CACHE_PATH), { recursive: true });
    const entry: SitemapCacheEntry = {
      ts: Date.now(),
      buildId: BUILD_ID,
      data,
    };
    fs.writeFileSync(SITEMAP_CACHE_PATH, JSON.stringify(entry));
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

// ---------------------------------------------------------------------------
// Visibility guard (ported from the parallel investigation in #77)
//
// The crawl honours exactly one visibility column, `_is_public`. A column
// named anything else — the "Public" this filter used to look for, or a
// "Draft"/"Published" added later — would be ignored in silence, which is the
// failure this whole change exists to fix. Detect and say so.
// ---------------------------------------------------------------------------
const VISIBILITY_FLAG_WORDS = [
  "public",
  "published",
  "publish",
  "private",
  "draft",
  "unlisted",
  "visibility",
  "visible",
  "hidden",
  "nopublish",
];

// Notion columns are named both ways ("Public" and "Is Public"), and the
// normalizer collapses the spacing, so match the "is" form of each word too —
// `_is_public` itself is one of them.
const VISIBILITY_PROPERTY_NAMES = new Set(
  VISIBILITY_FLAG_WORDS.flatMap((word) => [word, `is${word}`]),
);

const HONOURED_VISIBILITY_NAME = normalizePropertyName(
  NOTION_IS_PUBLIC_PROPERTY,
);

/**
 * Collection schema columns that look like a visibility flag but are not the
 * one the crawl reads. Empty is the healthy state.
 */
export function findUnhonouredVisibilityProperties(
  recordMap: Pick<ExtendedRecordMap, "collection">,
): string[] {
  const found = new Set<string>();

  for (const rawCollection of Object.values(recordMap.collection ?? {})) {
    const collection = unwrapRecordValue(rawCollection) as
      | { schema?: Record<string, { name?: string | null } | null> }
      | undefined;

    for (const schema of Object.values(collection?.schema ?? {})) {
      const name = schema?.name;
      const normalized = normalizePropertyName(name);
      if (!name || !normalized) continue;
      if (normalized === HONOURED_VISIBILITY_NAME) continue;
      if (VISIBILITY_PROPERTY_NAMES.has(normalized)) {
        found.add(name);
      }
    }
  }

  return [...found].toSorted();
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
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
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

  if (isProdRuntime) {
    // Fail loudly rather than start a 3-5 minute crawl that would exceed the
    // serverless maxDuration anyway. This only fires if the build skipped the
    // crawl or the cache file was not traced into the function bundle (see
    // outputFileTracingIncludes in next.config.js).
    throw new Error(
      "[sitemap] bundled sitemap cache missing at runtime — refusing to crawl Notion inside a serverless function",
    );
  }

  // concurrency: 1 to avoid hammering the unofficial Notion API with parallel
  // requests and triggering 429 rate limits.
  const pageMap = await getAllPagesInSpace(
    rootNotionPageId,
    rootNotionSpaceId,
    getPage,
    { concurrency: 1 },
  );

  // Reported below: a visibility filter that quietly matches nothing looks
  // exactly like a visibility filter that is working.
  const excludedByIsPublic: string[] = [];

  const canonicalPageMap = Object.keys(pageMap).reduce(
    (map: Record<string, string>, pageId: string) => {
      const recordMap = pageMap[pageId];
      if (!recordMap) {
        // Page failed to load (e.g. Notion API 429 rate limit). Skip rather
        // than aborting sitemap generation entirely.
        console.warn(`Skipping page "${pageId}" — recordMap unavailable`);
        return map;
      }

      // A page is publishable unless it carries `_is_public` and it is
      // unchecked — the same property RAG ingestion reads. Pages without the
      // property (every page until the column exists in Notion) are kept.
      //
      // Normalized at the read: the lookup walks the collection schema, and a
      // doubly-nested collection table hides it, so the filter would answer
      // "no property" for every page. Already-flat tables come back as the
      // same object, so this costs nothing.
      if (
        getNotionPageIsPublic(normalizeNotionRecordMap(recordMap), pageId) ===
        false
      ) {
        excludedByIsPublic.push(pageId);
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

  console.log(
    `[sitemap] ${Object.keys(canonicalPageMap).length} pages published, ` +
      `${excludedByIsPublic.length} excluded by ${NOTION_IS_PUBLIC_PROPERTY}`,
  );

  const unhonoured = new Set<string>();
  for (const recordMap of Object.values(pageMap)) {
    if (!recordMap) continue;
    for (const name of findUnhonouredVisibilityProperties(recordMap)) {
      unhonoured.add(name);
    }
  }
  if (unhonoured.size > 0) {
    console.warn(
      `[sitemap] Notion defines visibility-looking column(s) the crawl ignores: ` +
        `${[...unhonoured].toSorted().join(", ")}. ` +
        `Only "${NOTION_IS_PUBLIC_PROPERTY}" is honoured — rename the column or wire it in.`,
    );
  }

  const result = { pageMap, canonicalPageMap };
  writeSitemapCache(result);
  return result;
}
