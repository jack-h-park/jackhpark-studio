import { type ExtendedRecordMap } from "notion-types";
import { getAllPagesInSpace, getPageProperty } from "notion-utils";
import pMemoize from "p-memoize";

import type * as types from "./types";
import * as config from "./config";
import { includeNotionIdInUrls } from "./config";
import { getCanonicalPageId } from "./get-canonical-page-id";
import { notion } from "./notion-api";

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

const getPage = async (pageId: string, opts?: any) => {
  const recordMap = await notion.getPage(pageId, {
    kyOptions: {
      timeout: 30_000,
    },
    ...opts,
  });
  return normalizeBlocksForTraversal(recordMap);
};

async function getAllPagesImpl(
  rootNotionPageId: string,
  rootNotionSpaceId?: string,
): Promise<Partial<types.SiteMap>> {
  const pageMap = await getAllPagesInSpace(
    rootNotionPageId,
    rootNotionSpaceId,
    getPage,
  );

  const canonicalPageMap = Object.keys(pageMap).reduce(
    (map: Record<string, string>, pageId: string) => {
      const recordMap = pageMap[pageId];
      if (!recordMap) {
        throw new Error(`Error loading page "${pageId}"`);
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

  return {
    pageMap,
    canonicalPageMap,
  };
}
