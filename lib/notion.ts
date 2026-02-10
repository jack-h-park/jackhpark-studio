import {
  type CollectionView,
  type ExtendedRecordMap,
  type Role,
  type SearchParams,
  type SearchResults,
} from "notion-types";
import { mergeRecordMaps, parsePageId } from "notion-utils";
import pMap from "p-map";
import pMemoize from "p-memoize";

import {
  environment,
  isNotionPageCacheEnabled,
  isPreviewImageSupportEnabled,
  navigationLinks,
  navigationStyle,
  notionPageCacheKeyPrefix,
  notionPageCacheTTL,
} from "./config";
import { db } from "./db";
import { debugNotionXEnabled, debugNotionXLogger } from "./debug-notion-x";
import { getTweetsMap } from "./get-tweets";
import { notion } from "./notion-api";
import { getPreviewImageMap } from "./preview-images";

const normalizeGroupValue = (group: any) => {
  if (!group || typeof group !== "object") return group;

  const normalized = { ...group };
  const groupValue = normalized.value;

  if (
    groupValue &&
    typeof groupValue === "object" &&
    "value" in groupValue &&
    groupValue.value &&
    typeof (groupValue as any).value === "object"
  ) {
    const inner = (groupValue as any).value;

    if (typeof inner === "string") {
      return normalized;
    }

    if (inner && typeof inner === "object" && "group" in inner) {
      normalized.value = {
        ...groupValue,
        value: inner.group,
      };
    } else if (inner && typeof inner === "object" && "value" in inner) {
      normalized.value = {
        ...groupValue,
        value: inner.value,
      };
    }
  }

  return normalized;
};

const sanitizeCollectionViewForGrouping = (viewValue: any) => {
  if (!viewValue || typeof viewValue !== "object") {
    return viewValue;
  }

  const format = viewValue.format;
  if (!format || typeof format !== "object") {
    return viewValue;
  }

  const patchedFormat: any = { ...format };

  let collectionId: string | undefined =
    viewValue.collection_id ?? (viewValue as any).collectionId;

  const pointer =
    (viewValue as any).collection_pointer ?? (format as any).collection_pointer;
  if (!collectionId && pointer && typeof pointer === "object") {
    collectionId = pointer.id ?? pointer.collectionId ?? pointer.collection_id;
  }

  if (Array.isArray(format.collection_groups)) {
    patchedFormat.collection_groups =
      format.collection_groups.map(normalizeGroupValue);
  }

  if (Array.isArray(format.board_columns)) {
    patchedFormat.board_columns = format.board_columns.map(normalizeGroupValue);
  }

  // Some list/gallery views carry stale board grouping metadata.
  // That can force reducer keys like results:status:* and produce empty groups.
  if (
    (viewValue?.type === "list" || viewValue?.type === "gallery") &&
    patchedFormat.collection_group_by
  ) {
    delete patchedFormat.board_columns;
    delete patchedFormat.board_columns_by;
  }

  const sanitized = {
    ...viewValue,
    collection_id: collectionId ?? viewValue.collection_id,
    format: patchedFormat,
  };

  if (!sanitized.collection_id) {
    console.warn("[grouped-collection] missing collection id from view", {
      viewId: viewValue?.id,
      pointer,
    });
  }

  return sanitized;
};

const getCollectionValueDeep = (entry: any): any => {
  let value = entry?.value;
  let depth = 0;
  while (depth < 5 && value && typeof value === "object" && value.value) {
    const next = value.value;
    if (!next || typeof next !== "object") break;
    if (
      next.schema ||
      next.parent_id ||
      next.parent_table ||
      next.copied_from
    ) {
      value = next;
      break;
    }
    value = next;
    depth += 1;
  }
  return value;
};

const resolveCollectionDataId = (
  recordMap: ExtendedRecordMap,
  collectionId: string,
): string => {
  const rawEntry = recordMap.collection?.[collectionId];
  const value = getCollectionValueDeep(rawEntry);
  if (
    value &&
    typeof value === "object" &&
    value.parent_table === "collection" &&
    typeof value.parent_id === "string" &&
    value.parent_id.length > 0
  ) {
    return value.parent_id;
  }
  return collectionId;
};

const sanitizeForJSON = (value: any): any => {
  if (value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForJSON(item));
  }

  if (value && typeof value === "object") {
    const output: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      const sanitized = sanitizeForJSON(val);
      if (sanitized !== undefined) {
        output[key] = sanitized;
      }
    }
    return output;
  }

  return value;
};

const collectBlockIdsFromResultsBuckets = (entry: any): string[] => {
  if (!entry || typeof entry !== "object") {
    return [];
  }

  const seen = new Set<string>();
  const blockIds: string[] = [];

  for (const [key, value] of Object.entries(entry)) {
    if (!key.startsWith("results:")) continue;
    const ids = (value as any)?.blockIds;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
      seen.add(id);
      blockIds.push(id);
    }
  }

  return blockIds;
};

const normalizeCollectionQueryEntry = (entry: any): Record<string, any> => {
  if (!entry || typeof entry !== "object") {
    return {};
  }

  const reducerResults =
    entry.reducerResults && typeof entry.reducerResults === "object"
      ? entry.reducerResults
      : entry.reducers && typeof entry.reducers === "object"
        ? entry.reducers
        : null;

  // react-notion-x grouped renderers read results:* keys from top-level.
  // Ensure reducer payloads are flattened to that shape.
  const normalized: Record<string, any> = {
    ...(reducerResults ?? entry),
  };

  if (entry.collection_group_results && !normalized.collection_group_results) {
    normalized.collection_group_results = entry.collection_group_results;
  }
  if (entry.blockIds && !normalized.blockIds) {
    normalized.blockIds = entry.blockIds;
  }
  if (entry.list_groups && !normalized.list_groups) {
    normalized.list_groups = entry.list_groups;
  }
  if (entry.board_columns && !normalized.board_columns) {
    normalized.board_columns = entry.board_columns;
  }

  const groupedBlockIds = collectBlockIdsFromResultsBuckets(normalized);
  if (groupedBlockIds.length > 0) {
    if (!normalized.collection_group_results) {
      normalized.collection_group_results = {
        type: "results",
        blockIds: groupedBlockIds,
      };
    } else if (
      !Array.isArray(normalized.collection_group_results.blockIds) ||
      normalized.collection_group_results.blockIds.length === 0
    ) {
      normalized.collection_group_results = {
        ...normalized.collection_group_results,
        blockIds: groupedBlockIds,
      };
    }

    if (!Array.isArray(normalized.blockIds) || normalized.blockIds.length === 0) {
      normalized.blockIds = groupedBlockIds;
    }
  }

  return sanitizeForJSON(normalized);
};

const getQueryBlockCount = (entry: any): number => {
  if (!entry || typeof entry !== "object") return 0;

  const groupCount = entry.collection_group_results?.blockIds?.length;
  if (typeof groupCount === "number" && groupCount > 0) return groupCount;

  const blockCount = entry.blockIds?.length;
  if (typeof blockCount === "number" && blockCount > 0) return blockCount;

  return collectBlockIdsFromResultsBuckets(entry).length;
};

const hasGroupedBlocks = (entry: any): boolean => {
  if (!entry || typeof entry !== "object") return false;

  const collectionGroupResults = entry.collection_group_results;
  if (
    collectionGroupResults &&
    Array.isArray(collectionGroupResults.blockIds)
  ) {
    if (collectionGroupResults.blockIds.length > 0) {
      return true;
    }
  }

  const bucketSources: Array<Record<string, any> | undefined> = [
    entry.reducerResults,
    entry.reducers,
  ];

  for (const source of bucketSources) {
    if (!source || typeof source !== "object") continue;
    for (const value of Object.values(source)) {
      const blockIds = (value as any)?.blockIds;
      if (Array.isArray(blockIds) && blockIds.length > 0) {
        return true;
      }
    }
  }

  return false;
};

const mergeCollectionQuery = (
  target: any,
  source: any,
  collectionId: string,
  viewId: string,
) => {
  if (!source) {
    return target;
  }

  const clone = {
    ...target,
    collection_query: {
      ...target?.collection_query,
    },
  };

  if (!clone.collection_query[collectionId]) {
    clone.collection_query[collectionId] = {};
  }

  const existing = clone.collection_query[collectionId][viewId] ?? {};
  const normalizedSource = normalizeCollectionQueryEntry(source);
  clone.collection_query[collectionId][viewId] = sanitizeForJSON({
    ...existing,
    ...normalizedSource,
  });

  return clone;
};

const getNavigationLinkPages = pMemoize(
  async (): Promise<ExtendedRecordMap[]> => {
    const navigationLinkPageIds = (navigationLinks || []).reduce<string[]>(
      (acc, link) => {
        if (!link?.pageId) {
          return acc;
        }

        const normalized = parsePageId(link.pageId, { uuid: true });
        if (!normalized) {
          console.warn(
            `[notion] skipping invalid navigation link pageId "${link.pageId}"`,
          );
          return acc;
        }

        acc.push(normalized);
        return acc;
      },
      [],
    );

    if (navigationStyle !== "default" && navigationLinkPageIds.length) {
      return pMap(
        navigationLinkPageIds,
        async (navigationLinkPageId) =>
          notion.getPage(navigationLinkPageId, {
            chunkLimit: 1,
            fetchMissingBlocks: false,
            fetchCollections: false,
            signFileUrls: false,
          }),
        {
          concurrency: 4,
        },
      );
    }

    return [];
  },
);

const inFlightPageFetches = new Map<string, Promise<ExtendedRecordMap>>();
const enableGroupedCollectionHydration =
  process.env.NOTION_GROUP_HYDRATION !== "0";

type MemoryCacheEntry = {
  recordMap: ExtendedRecordMap;
  expiresAt: number;
};

const memoryPageCache = new Map<string, MemoryCacheEntry>();

const getPageCacheKey = (pageId: string | null | undefined) => {
  const normalizedId = (pageId ?? "").replaceAll("-", "");
  const hydrationMode = enableGroupedCollectionHydration ? "gh-on" : "gh-off";
  return `${notionPageCacheKeyPrefix}:${environment}:${hydrationMode}:${normalizedId}`;
};

const getCacheExpiry = () =>
  typeof notionPageCacheTTL === "number"
    ? Date.now() + notionPageCacheTTL
    : Date.now();

const getCachedRecordMapFromMemory = (cacheKey: string) => {
  const entry = memoryPageCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (typeof notionPageCacheTTL === "number" && Date.now() > entry.expiresAt) {
    memoryPageCache.delete(cacheKey);
    return null;
  }

  return entry.recordMap;
};

const setCachedRecordMapInMemory = (
  cacheKey: string,
  recordMap: ExtendedRecordMap,
) => {
  if (!isNotionPageCacheEnabled) {
    return;
  }

  memoryPageCache.set(cacheKey, {
    recordMap,
    expiresAt: getCacheExpiry(),
  });
};

const readCachedRecordMap = async (
  cacheKey: string,
): Promise<ExtendedRecordMap | null> => {
  if (!isNotionPageCacheEnabled) {
    return null;
  }

  try {
    const cached = (await db.get(cacheKey)) as ExtendedRecordMap | undefined;
    if (cached) {
      setCachedRecordMapInMemory(cacheKey, cached);
      return cached;
    }
  } catch (err: any) {
    console.warn(`redis error get "${cacheKey}"`, err.message);
  }

  return null;
};

const writeCachedRecordMap = async (
  cacheKey: string,
  recordMap: ExtendedRecordMap,
) => {
  if (!isNotionPageCacheEnabled) {
    return;
  }

  try {
    if (typeof notionPageCacheTTL === "number") {
      await db.set(cacheKey, recordMap, notionPageCacheTTL);
    } else {
      await db.set(cacheKey, recordMap);
    }
    setCachedRecordMapInMemory(cacheKey, recordMap);
  } catch (err: any) {
    console.warn(`redis error set "${cacheKey}"`, err.message);
  }
};

const loadPageFromNotion = async (
  pageId: string,
): Promise<ExtendedRecordMap> => {
  let recordMap = await notion.getPage(pageId, {
    fetchCollections: true,
    fetchMissingBlocks: true,
    fetchRelationPages: true,
  });

  if (navigationStyle !== "default") {
    const navigationLinkRecordMaps = await getNavigationLinkPages();

    if (navigationLinkRecordMaps?.length) {
      recordMap = navigationLinkRecordMaps.reduce(
        (map, navigationLinkRecordMap) =>
          mergeRecordMaps(map, navigationLinkRecordMap),
        recordMap,
      );
    }
  }

  if (isPreviewImageSupportEnabled) {
    const previewImageMap = await getPreviewImageMap(recordMap);
    (recordMap as any).preview_images = previewImageMap;
  }

  await getTweetsMap(recordMap);

  return recordMap;
};

const hydrateGroupedCollectionData = async (
  recordMap: ExtendedRecordMap,
): Promise<ExtendedRecordMap> => {
  const collectionViews = recordMap.collection_view;

  if (!collectionViews) {
    return recordMap;
  }

  const targets = Object.entries(collectionViews)
    .map(([viewId, view]) => {
      if (!view || typeof view !== "object") {
        return null;
      }

      const typedView = view as { role: Role; value: CollectionView };
      const rawView = typedView.value;
      if (!rawView) return null;

      const sanitizedView = sanitizeCollectionViewForGrouping(rawView);
      recordMap.collection_view[viewId] = {
        ...typedView,
        value: sanitizedView,
      };
      const collectionId = sanitizedView?.collection_id as string | undefined;
      const format = sanitizedView?.format;

      if (!collectionId) {
        return null;
      }

      const hasGrouping =
        Boolean(format?.collection_group_by) ||
        Boolean(format?.board_columns_by) ||
        (Array.isArray(format?.collection_groups) &&
          format.collection_groups.length > 0) ||
        (Array.isArray(format?.board_columns) &&
          format.board_columns.length > 0);

      if (!hasGrouping) {
        return null;
      }

      const existingEntry =
        recordMap.collection_query?.[collectionId]?.[viewId] ?? null;

      if (existingEntry) {
        const normalizedExisting = normalizeCollectionQueryEntry(existingEntry);
        if (!recordMap.collection_query) {
          recordMap.collection_query = {};
        }
        if (!recordMap.collection_query[collectionId]) {
          recordMap.collection_query[collectionId] = {};
        }
        recordMap.collection_query[collectionId][viewId] =
          normalizedExisting as any;

        if (hasGroupedBlocks(normalizedExisting)) {
          return null;
        }
      }

      if (debugNotionXEnabled) {
        debugNotionXLogger.debug("[grouped-collection] hydration scheduled", {
          viewId,
          collectionId,
          viewType: sanitizedView?.type,
          hasGrouping,
          hasExistingResult: Boolean(existingEntry),
        });
      }

      return {
        viewId,
        collectionId,
        fetchCollectionId: resolveCollectionDataId(recordMap, collectionId),
        viewValue: sanitizedView,
        existingEntry,
      };
    })
    .filter(Boolean) as Array<{
    viewId: string;
    collectionId: string;
    fetchCollectionId: string;
    viewValue: any;
    existingEntry: any;
  }>;

  if (!targets.length) {
    return recordMap;
  }

  await pMap(
    targets,
    async ({
      viewId,
      collectionId,
      fetchCollectionId,
      viewValue,
      existingEntry,
    }) => {
      try {
        const data = await notion.getCollectionData(
          fetchCollectionId,
          viewId,
          viewValue,
          {
            limit: 999,
          },
        );

        if (data?.recordMap) {
          recordMap = mergeRecordMaps(recordMap, data.recordMap as any);

          const fetchedEntry =
            (data.recordMap as ExtendedRecordMap).collection_query?.[
              fetchCollectionId
            ]?.[viewId] ??
            (data.recordMap as ExtendedRecordMap).collection_query?.[
              collectionId
            ]?.[viewId];
          if (fetchedEntry) {
            recordMap = mergeCollectionQuery(
              recordMap,
              fetchedEntry,
              collectionId,
              viewId,
            );
          }
        }

        if (data?.result) {
          const normalizedResult = normalizeCollectionQueryEntry(data.result);

          if (!recordMap.collection_query) {
            recordMap.collection_query = {};
          }

          if (!recordMap.collection_query[collectionId]) {
            recordMap.collection_query[collectionId] = {};
          }

          const fetchedBlockCount = getQueryBlockCount(normalizedResult);
          const existingBlockCount = getQueryBlockCount(existingEntry);

          // Keep previous query when fetched grouped payload is empty.
          if (!(fetchedBlockCount === 0 && existingBlockCount > 0)) {
            recordMap.collection_query[collectionId][viewId] =
              normalizedResult as any;
          }

          const listGroups = normalizedResult?.list_groups?.results;
          if (Array.isArray(listGroups) && listGroups.length > 0) {
            const view = recordMap.collection_view?.[viewId];
            const propertyKey =
              recordMap.collection_view?.[viewId]?.value?.format
                ?.collection_group_by?.property;
            if (view?.value?.format) {
              view.value.format.collection_groups = listGroups.map(
                (group: any) =>
                  normalizeGroupValue({
                    value: group?.value,
                    property: propertyKey,
                    hidden: group?.visible === false,
                  }),
              );
            }
          }
        }
      } catch (err: any) {
        console.warn(
          `[grouped-collection] fetch failed ${collectionId}:${viewId}`,
          err?.message ?? err,
        );
      }
    },
    { concurrency: 1 },
  );

  return recordMap;
};

export async function getPage(pageId: string): Promise<ExtendedRecordMap> {
  const cacheKey = getPageCacheKey(pageId);

  if (isNotionPageCacheEnabled) {
    const memoryCached = getCachedRecordMapFromMemory(cacheKey);
    if (memoryCached) {
      if (enableGroupedCollectionHydration) {
        const hydratedCached = await hydrateGroupedCollectionData(memoryCached);
        setCachedRecordMapInMemory(cacheKey, hydratedCached);
        await writeCachedRecordMap(cacheKey, hydratedCached);
        return hydratedCached;
      }

      return memoryCached;
    }

    const persistentCached = await readCachedRecordMap(cacheKey);
    if (persistentCached) {
      if (enableGroupedCollectionHydration) {
        const hydratedPersistent =
          await hydrateGroupedCollectionData(persistentCached);
        setCachedRecordMapInMemory(cacheKey, hydratedPersistent);
        await writeCachedRecordMap(cacheKey, hydratedPersistent);
        return hydratedPersistent;
      }

      return persistentCached;
    }
  }

  const existingFetch = inFlightPageFetches.get(cacheKey);

  if (existingFetch) {
    return existingFetch;
  }

  const fetchPromise = (async () => {
    const recordMap = await loadPageFromNotion(pageId);
    const finalRecordMap = enableGroupedCollectionHydration
      ? await hydrateGroupedCollectionData(recordMap)
      : recordMap;

    await writeCachedRecordMap(cacheKey, finalRecordMap);

    return finalRecordMap;
  })();

  inFlightPageFetches.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    inFlightPageFetches.delete(cacheKey);
  }
}

export async function search(params: SearchParams): Promise<SearchResults> {
  return notion.search(params);
}
