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
import { errorMessage } from "./error-message";
import { getTweetsMap } from "./get-tweets";
import { notion } from "./notion-api";
import { withRateLimitRetry } from "./notion-rate-limit";
import { getPreviewImageMap } from "./preview-images";
import {
  resolveCollectionDataId,
  unwrapRecordValue,
} from "./rag/notion-record-value";

/**
 * Notion's wire JSON, which this module narrows at runtime rather than trusting
 * by shape. `unknown` is deliberate: it forces each access through a guard, and
 * an unguarded one stops compiling. That is the whole point here — a silent
 * shape change in a recordMap is what gutted the RAG corpus before.
 */
type JsonRecord = Record<string, unknown>;

/**
 * Exactly the `value && typeof value === "object"` test this file already used,
 * arrays included, so narrowing changes no runtime behavior.
 */
const isObject = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === "object";

/** `value?.property`, for grouping descriptors whose shape is not guaranteed. */
const readProperty = (value: unknown): unknown =>
  isObject(value) ? value.property : undefined;

/** `viewValue.format`, narrowed — all grouping metadata hangs off it. */
const readFormat = (viewValue: unknown): JsonRecord | undefined => {
  const format = isObject(viewValue) ? viewValue.format : undefined;
  return isObject(format) ? format : undefined;
};

/**
 * Length of a reducer bucket's `results`. Notion returns these at the top level
 * on some responses and nested under `reducerResults`/`reducers` on others, so
 * every read has to try all three.
 */
const countReducerResults = (result: unknown, reducerKey: string): number => {
  if (!isObject(result)) return 0;

  // First non-empty wins: an earlier bag carrying an empty `results` should not
  // mask a later one that actually has groups.
  for (const bag of [result, result.reducerResults, result.reducers]) {
    if (!isObject(bag)) continue;
    const bucket = bag[reducerKey];
    if (isObject(bucket) && Array.isArray(bucket.results)) {
      if (bucket.results.length > 0) return bucket.results.length;
    }
  }

  return 0;
};

const normalizeGroupValue = (group: unknown): unknown => {
  if (!isObject(group)) return group;

  const normalized: JsonRecord = { ...group };
  const groupValue = normalized.value;

  if (
    isObject(groupValue) &&
    "value" in groupValue &&
    groupValue.value &&
    typeof groupValue.value === "object"
  ) {
    // Widened back to unknown so the string check below stays reachable to the
    // compiler; it is defensive against a shape Notion has not returned yet.
    const inner: unknown = groupValue.value;

    if (typeof inner === "string") {
      return normalized;
    }

    if (isObject(inner) && "group" in inner) {
      normalized.value = {
        ...groupValue,
        value: inner.group,
      };
    } else if (isObject(inner) && "value" in inner) {
      normalized.value = {
        ...groupValue,
        value: inner.value,
      };
    }
  }

  return normalized;
};

const sanitizeCollectionViewForGrouping = (viewValue: unknown): unknown => {
  if (!isObject(viewValue)) {
    return viewValue;
  }

  const format = viewValue.format;
  if (!isObject(format)) {
    return viewValue;
  }

  const patchedFormat: JsonRecord = { ...format };

  const declaredId = viewValue.collection_id ?? viewValue.collectionId;
  let collectionId: string | undefined =
    typeof declaredId === "string" ? declaredId : undefined;

  const pointer = viewValue.collection_pointer ?? format.collection_pointer;
  if (!collectionId && isObject(pointer)) {
    const pointerId =
      pointer.id ?? pointer.collectionId ?? pointer.collection_id;
    collectionId = typeof pointerId === "string" ? pointerId : undefined;
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

const sanitizeForJSON = (value: unknown): unknown => {
  if (value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForJSON(item));
  }

  if (value && typeof value === "object") {
    const output: JsonRecord = {};
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

const collectBlockIdsFromResultsBuckets = (entry: unknown): string[] => {
  if (!isObject(entry)) {
    return [];
  }

  const seen = new Set<string>();
  const blockIds: string[] = [];

  for (const [key, value] of Object.entries(entry)) {
    if (!key.startsWith("results:")) continue;
    const ids = isObject(value) ? value.blockIds : undefined;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
      seen.add(id);
      blockIds.push(id);
    }
  }

  return blockIds;
};

const normalizeCollectionQueryEntry = (entry: unknown): JsonRecord => {
  if (!isObject(entry)) {
    return {};
  }

  const reducerResults = isObject(entry.reducerResults)
    ? entry.reducerResults
    : isObject(entry.reducers)
      ? entry.reducers
      : null;

  // react-notion-x grouped renderers read results:* keys from top-level.
  // Ensure reducer payloads are flattened to that shape.
  const normalized: JsonRecord = {
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
      isObject(normalized.collection_group_results) &&
      (!Array.isArray(normalized.collection_group_results.blockIds) ||
        normalized.collection_group_results.blockIds.length === 0)
    ) {
      normalized.collection_group_results = {
        ...normalized.collection_group_results,
        blockIds: groupedBlockIds,
      };
    }

    if (
      !Array.isArray(normalized.blockIds) ||
      normalized.blockIds.length === 0
    ) {
      normalized.blockIds = groupedBlockIds;
    }
  }

  // sanitizeForJSON only ever widens values in place, so the object shape it
  // returns is the JsonRecord it was handed.
  return sanitizeForJSON(normalized) as JsonRecord;
};

const getQueryBlockCount = (entry: unknown): number => {
  if (!isObject(entry)) return 0;

  // Array.isArray rather than a bare `.length`: these are block-id counts, so a
  // value that merely happens to have a length (a string) is not one.
  const groupResults = entry.collection_group_results;
  if (isObject(groupResults) && Array.isArray(groupResults.blockIds)) {
    const groupCount = groupResults.blockIds.length;
    if (groupCount > 0) return groupCount;
  }

  if (Array.isArray(entry.blockIds) && entry.blockIds.length > 0) {
    return entry.blockIds.length;
  }

  return collectBlockIdsFromResultsBuckets(entry).length;
};

const hasGroupedBlocks = (entry: unknown): boolean => {
  if (!isObject(entry)) return false;

  const collectionGroupResults = entry.collection_group_results;
  if (
    isObject(collectionGroupResults) &&
    Array.isArray(collectionGroupResults.blockIds)
  ) {
    if (collectionGroupResults.blockIds.length > 0) {
      return true;
    }
  }

  const bucketSources: unknown[] = [entry.reducerResults, entry.reducers];

  for (const source of bucketSources) {
    if (!isObject(source)) continue;
    for (const value of Object.values(source)) {
      const blockIds = isObject(value) ? value.blockIds : undefined;
      if (Array.isArray(blockIds) && blockIds.length > 0) {
        return true;
      }
    }
  }

  return false;
};

const getGroupedResultBucketKeys = (entry: unknown): string[] => {
  if (!isObject(entry)) return [];
  return Object.keys(entry).filter((key) => key.startsWith("results:"));
};

const buildGroupedFormatEntriesFromV2Reducer = (
  result: unknown,
  viewValue: unknown,
): JsonRecord[] => {
  if (!isObject(result)) return [];
  if (!isObject(viewValue)) return [];

  const isBoardType = viewValue.type === "board";
  const reducerKey = isBoardType ? "board_columns" : `${viewValue.type}_groups`;
  const reducerResultsBag = isObject(result.reducerResults)
    ? result.reducerResults
    : undefined;
  const reducersBag = isObject(result.reducers) ? result.reducers : undefined;
  const reducer =
    result[reducerKey] ??
    reducerResultsBag?.[reducerKey] ??
    reducersBag?.[reducerKey];
  const reducerResults =
    isObject(reducer) && Array.isArray(reducer.results) ? reducer.results : [];

  const format = readFormat(viewValue);
  const propertyKey =
    readProperty(format?.collection_group_by) ??
    readProperty(format?.board_columns_by);
  if (typeof propertyKey !== "string" || propertyKey.length === 0) {
    return [];
  }

  return reducerResults
    .map((group: unknown) =>
      normalizeGroupValue({
        property: propertyKey,
        hidden: isObject(group) && group.visible === false,
        value: isObject(group) ? group.value : undefined,
      }),
    )
    .filter((group): group is JsonRecord => {
      if (!isObject(group)) return false;
      const value = group.value;
      return isObject(value) && typeof value.type === "string";
    });
};

const hasEmptyGroupedFormatEntries = (viewValue: unknown): boolean => {
  const format = readFormat(viewValue);
  if (!format) return false;

  if (format.collection_group_by) {
    return !Array.isArray(format.collection_groups) || format.collection_groups.length === 0;
  }
  if (format.board_columns_by) {
    return !Array.isArray(format.board_columns) || format.board_columns.length === 0;
  }
  return false;
};

const applyGroupedFormatEntriesToView = (
  viewValue: unknown,
  groups: unknown[],
): unknown => {
  if (!isObject(viewValue)) return viewValue;
  if (!Array.isArray(groups) || groups.length === 0) return viewValue;

  const format = isObject(viewValue.format) ? viewValue.format : {};
  if (format.collection_group_by) {
    return {
      ...viewValue,
      format: {
        ...format,
        collection_groups: groups,
      },
    };
  }
  if (format.board_columns_by) {
    return {
      ...viewValue,
      format: {
        ...format,
        board_columns: groups,
      },
    };
  }

  return viewValue;
};

const getGroupQueryLabelFromFormatEntry = (entry: unknown): unknown => {
  const entryValue = isObject(entry) ? entry.value : undefined;
  const rawValue = isObject(entryValue) ? entryValue.value : undefined;
  if (rawValue === undefined) return "uncategorized";

  if (isObject(rawValue) && "range" in rawValue) {
    const range = rawValue.range;
    return isObject(range) ? range.start_date || range.end_date : undefined;
  }

  if (isObject(rawValue) && "value" in rawValue) {
    return rawValue.value;
  }

  return rawValue;
};

const formatGroupEntryToBucketKey = (entry: unknown): string | null => {
  const entryValue = isObject(entry) ? entry.value : undefined;
  const type = isObject(entryValue) ? entryValue.type : undefined;
  const queryLabel = getGroupQueryLabelFromFormatEntry(entry);
  if (typeof type !== "string" || type.length === 0) return null;
  if (typeof queryLabel !== "string" || queryLabel.length === 0) return null;
  return `results:${type}:${queryLabel}`;
};

const syncGroupedViewFormatFromResultBuckets = (
  view: unknown,
  result: unknown,
) => {
  const format = readFormat(view);
  if (!format) return;

  const bucketKeys = getGroupedResultBucketKeys(result);
  if (bucketKeys.length === 0) return;

  const collectionGroupBy = format.collection_group_by;
  const boardGroupBy = format.board_columns_by;
  const targetKey = collectionGroupBy
    ? "collection_groups"
    : boardGroupBy
      ? "board_columns"
      : null;
  const propertyKey =
    readProperty(collectionGroupBy) ?? readProperty(boardGroupBy);

  if (
    !targetKey ||
    typeof propertyKey !== "string" ||
    propertyKey.length === 0
  ) {
    return;
  }

  const target = format[targetKey];
  const existingGroups: unknown[] = Array.isArray(target) ? target : [];
  const visibleExistingGroups = existingGroups.filter(
    (group) => !(isObject(group) && group.hidden === true),
  );
  const visibleExistingBucketKeys = new Set(
    visibleExistingGroups
      .map(formatGroupEntryToBucketKey)
      .filter(Boolean) as string[],
  );
  const hiddenExistingBucketKeys = new Set(
    existingGroups.map(formatGroupEntryToBucketKey).filter(Boolean) as string[],
  );
  const hasVisibleMatchingGroup =
    visibleExistingBucketKeys.size > 0 &&
    bucketKeys.some((bucketKey) => visibleExistingBucketKeys.has(bucketKey));
  const hasAnyMatchingGroup =
    hiddenExistingBucketKeys.size > 0 &&
    bucketKeys.some((bucketKey) => hiddenExistingBucketKeys.has(bucketKey));
  const allGroupsHidden =
    existingGroups.length > 0 &&
    existingGroups.every((group) => isObject(group) && group.hidden === true);

  // Rebuild when groups are absent, all hidden, or only hidden groups match.
  if (
    hasVisibleMatchingGroup ||
    (hasAnyMatchingGroup && !allGroupsHidden && visibleExistingGroups.length > 0)
  ) {
    return;
  }

  format[targetKey] = bucketKeys.map((bucketKey) => {
    const [, type = "text", ...labelParts] = bucketKey.split(":");
    const label = labelParts.join(":");

    return {
      property: propertyKey,
      hidden: false,
      value: {
        type,
        value: label === "uncategorized" ? undefined : label,
      },
    };
  });
};

const isGroupedQueryPayloadUsableForView = (
  entry: unknown,
  viewValue: unknown,
) => {
  if (!isObject(entry)) return false;
  if (!hasGroupedBlocks(entry)) return false;

  const format = readFormat(viewValue);
  const groupProperty =
    readProperty(format?.collection_group_by) ??
    readProperty(format?.board_columns_by);

  const bucketKeys = getGroupedResultBucketKeys(entry);
  const listGroups = isObject(entry.list_groups)
    ? entry.list_groups.results
    : undefined;
  const hasListGroups = Array.isArray(listGroups);
  const hasBoardColumns = Array.isArray(entry.board_columns);

  // Grouped views need either reducer buckets or a view-specific grouped payload.
  // `collection_group_results.blockIds` alone can be stale and produce an empty render.
  if (bucketKeys.length === 0 && !hasListGroups && !hasBoardColumns) {
    return false;
  }

  if (typeof groupProperty === "string" && groupProperty.length > 0) {
    if (
      bucketKeys.length > 0 &&
      !bucketKeys.some(
        (key) =>
          key === `results:${groupProperty}` ||
          key.startsWith(`results:${groupProperty}:`),
      )
    ) {
      return false;
    }
  }

  return true;
};

type CollectionQueryEntry =
  ExtendedRecordMap["collection_query"][string][string];

const mergeCollectionQuery = (
  target: ExtendedRecordMap,
  source: unknown,
  collectionId: string,
  viewId: string,
): ExtendedRecordMap => {
  if (!source) {
    return target;
  }

  const clone: ExtendedRecordMap = {
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
  }) as CollectionQueryEntry;

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
  { extendDeadline = true }: { extendDeadline?: boolean } = {},
) => {
  if (!isNotionPageCacheEnabled) {
    return;
  }

  const existing = memoryPageCache.get(cacheKey);
  const expiresAt =
    !extendDeadline && existing ? existing.expiresAt : getCacheExpiry();

  memoryPageCache.set(cacheKey, { recordMap, expiresAt });
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
      // Mirror into memory, but do NOT extend the deadline: the persistent
      // entry keeps its own TTL, and a memory copy that outlives it would
      // re-introduce the sliding expiry this path exists to avoid.
      setCachedRecordMapInMemory(cacheKey, cached, { extendDeadline: false });
      return cached;
    }
  } catch (err: unknown) {
    console.warn(`redis error get "${cacheKey}"`, errorMessage(err));
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
  } catch (err: unknown) {
    console.warn(`redis error set "${cacheKey}"`, errorMessage(err));
  }
};

/**
 * After getPage, notion-client may not load children of callout/toggle blocks
 * inside collection item pages (due to page-boundary stops in block traversal).
 * This function finds those missing grandchildren and fetches them so that
 * collection card cover thumbnails can use their text content (e.g. eyebrow labels).
 */
/** Caller-side view of the block fields this traversal reads. */
type ContentBlockView = {
  parent_table?: string;
  type?: string;
  content?: string[];
};

const fetchCollectionCardCalloutChildren = async (
  recordMap: ExtendedRecordMap,
): Promise<void> => {
  const missingChildIds = new Set<string>();

  for (const blockId of Object.keys(recordMap.block)) {
    const b = unwrapRecordValue<ContentBlockView>(recordMap.block[blockId]);
    if (!b || b.parent_table !== "collection") continue;
    if (b.type !== "page" && b.type !== "collection_view_page") continue;
    if (!Array.isArray(b.content)) continue;

    for (const childId of b.content) {
      const child = unwrapRecordValue<ContentBlockView>(
        recordMap.block[childId],
      );
      if (!child || (child.type !== "callout" && child.type !== "toggle"))
        continue;
      if (!Array.isArray(child.content)) continue;

      for (const grandchildId of child.content) {
        if (!recordMap.block[grandchildId]) {
          missingChildIds.add(grandchildId);
        }
      }
    }
  }

  if (missingChildIds.size === 0) return;

  try {
    const result = await notion.getBlocks(Array.from(missingChildIds));
    const newBlocks = result?.recordMap?.block;
    if (newBlocks) {
      recordMap.block = { ...recordMap.block, ...newBlocks };
    }
  } catch (err: unknown) {
    console.warn("fetchCollectionCardCalloutChildren error", errorMessage(err));
  }
};

const loadPageFromNotion = async (
  pageId: string,
): Promise<ExtendedRecordMap> => {
  // A production build prerenders every page, which reliably trips Notion's
  // rate limiter. Callers now rethrow instead of publishing a 404, so a 429
  // that outlives the retry budget fails the build rather than quietly
  // dropping the page from the site.
  return withRateLimitRetry(async () => {
    let recordMap = await notion.getPage(pageId, {
      fetchCollections: true,
      fetchMissingBlocks: true,
      fetchRelationPages: true,
    });

    await fetchCollectionCardCalloutChildren(recordMap);

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

    await getTweetsMap(recordMap);

    return recordMap;
  });
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
      const rawView: unknown = unwrapRecordValue(view) ?? typedView.value;
      if (!rawView) return null;

      const sanitizedView = sanitizeCollectionViewForGrouping(rawView);
      recordMap.collection_view[viewId] = {
        ...typedView,
        // The sanitizer only rewrites grouping metadata in place; the record it
        // returns is still the CollectionView it was given.
        value: sanitizedView as CollectionView,
      };

      if (!isObject(sanitizedView)) return null;

      const collectionId =
        typeof sanitizedView.collection_id === "string"
          ? sanitizedView.collection_id
          : undefined;
      const format = readFormat(sanitizedView);

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
        // Wire JSON asserted into notion-types' shape: the normalizer works in
        // terms of the keys react-notion-x reads, not the declared interface.
        recordMap.collection_query[collectionId][viewId] =
          normalizedExisting as unknown as CollectionQueryEntry;

        if (
          !hasGrouping ||
          isGroupedQueryPayloadUsableForView(normalizedExisting, sanitizedView)
        ) {
          return null;
        }

        if (debugNotionXEnabled) {
          debugNotionXLogger.debug(
            "[grouped-collection] forcing refetch due to stale grouped payload",
            {
              viewId,
              collectionId,
              viewType: sanitizedView.type,
              groupBy:
                readProperty(format?.collection_group_by) ??
                readProperty(format?.board_columns_by) ??
                null,
              existingQueryKeys: Object.keys(normalizedExisting ?? {}),
              resultBucketKeys: getGroupedResultBucketKeys(normalizedExisting),
            },
          );
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
    viewValue: JsonRecord;
    existingEntry: unknown;
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
      const viewFormat = readFormat(viewValue);

      try {
        let data = await notion.getCollectionData(
          fetchCollectionId,
          viewId,
          viewValue,
          {
            limit: 999,
          },
        );

        console.warn("[grouped-collection] first fetch result", {
          viewId,
          collectionId,
          fetchCollectionId,
          viewType: viewValue.type,
          hasCollectionGroups: Array.isArray(viewFormat?.collection_groups),
          collectionGroupsLen: Array.isArray(viewFormat?.collection_groups)
            ? viewFormat.collection_groups.length
            : null,
          hasBoardColumns: Array.isArray(viewFormat?.board_columns),
          boardColumnsLen: Array.isArray(viewFormat?.board_columns)
            ? viewFormat.board_columns.length
            : null,
          resultKeys: data?.result ? Object.keys(data.result) : null,
          resultBucketKeys: getGroupedResultBucketKeys(data?.result),
          hasGalleryGroups:
            countReducerResults(data?.result, "gallery_groups") > 0,
          galleryGroupsLen: countReducerResults(data?.result, "gallery_groups"),
        });

        const bootstrapGroups = buildGroupedFormatEntriesFromV2Reducer(
          data?.result,
          viewValue,
        );
        const shouldBootstrapGroupedRefetch =
          hasEmptyGroupedFormatEntries(viewValue) &&
          bootstrapGroups.length > 0 &&
          getGroupedResultBucketKeys(data?.result).length === 0;

        if (shouldBootstrapGroupedRefetch) {
          const bootstrappedViewValue = applyGroupedFormatEntriesToView(
            viewValue,
            bootstrapGroups,
          );
          const bootstrappedFormatOwner = isObject(bootstrappedViewValue)
            ? bootstrappedViewValue
            : undefined;
          const bootstrappedFormat = readFormat(bootstrappedFormatOwner);

          const currentViewEntry = recordMap.collection_view?.[viewId];
          if (currentViewEntry?.value) {
            recordMap.collection_view[viewId] = {
              ...currentViewEntry,
              value: bootstrappedViewValue as CollectionView,
            };
          }

          console.warn("[grouped-collection] bootstrap refetch from v2 groups", {
            viewId,
            collectionId,
            fetchCollectionId,
            viewType: viewValue?.type,
            reducerKeys: Object.keys(data?.result ?? {}),
            bootstrapGroupCount: bootstrapGroups.length,
            bootstrapFirstGroup: bootstrapGroups[0] ?? null,
          });

          data = await notion.getCollectionData(
            fetchCollectionId,
            viewId,
            bootstrappedViewValue,
            {
              limit: 999,
            },
          );

          console.warn("[grouped-collection] second fetch result", {
            viewId,
            collectionId,
            fetchCollectionId,
            viewType: bootstrappedFormatOwner?.type,
            collectionGroupsLen: Array.isArray(
              bootstrappedFormat?.collection_groups,
            )
              ? bootstrappedFormat.collection_groups.length
              : null,
            boardColumnsLen: Array.isArray(bootstrappedFormat?.board_columns)
              ? bootstrappedFormat.board_columns.length
              : null,
            resultKeys: data?.result ? Object.keys(data.result) : null,
            resultBucketKeys: getGroupedResultBucketKeys(data?.result),
            hasGalleryGroups:
              countReducerResults(data?.result, "gallery_groups") > 0,
            galleryGroupsLen: countReducerResults(
              data?.result,
              "gallery_groups",
            ),
          });
        }

        if (data?.recordMap) {
          recordMap = mergeRecordMaps(
            recordMap,
            data.recordMap as ExtendedRecordMap,
          );

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
              normalizedResult as unknown as CollectionQueryEntry;
          }

          const hydratedView = recordMap.collection_view?.[viewId]?.value;
          syncGroupedViewFormatFromResultBuckets(hydratedView, normalizedResult);

          const listGroupsContainer = normalizedResult.list_groups;
          const listGroups = isObject(listGroupsContainer)
            ? listGroupsContainer.results
            : undefined;
          if (Array.isArray(listGroups) && listGroups.length > 0) {
            const view = recordMap.collection_view?.[viewId];
            const propertyKey = readProperty(
              recordMap.collection_view?.[viewId]?.value?.format
                ?.collection_group_by,
            );
            if (view?.value?.format) {
              view.value.format.collection_groups = listGroups.map(
                (group: unknown) =>
                  normalizeGroupValue({
                    value: isObject(group) ? group.value : undefined,
                    property: propertyKey,
                    hidden: isObject(group) && group.visible === false,
                  }),
              );
            }
          }
        }
      } catch (err: unknown) {
        console.warn(
          `[grouped-collection] fetch failed ${collectionId}:${viewId}`,
          errorMessage(err),
        );
      }
    },
    { concurrency: 1 },
  );

  return recordMap;
};

/**
 * Post-fetch finalization shared by every `getPage` path.
 *
 * LQIP placeholders have to be generated *after* hydration: grouped-collection
 * hydration is what pulls gallery card blocks — and therefore their cover
 * images — into the record map. Generating earlier silently skips every
 * gallery cover. `getPreviewImage` is memoized per URL, so repeating this on
 * cache hits costs a map rebuild and picks up covers that hydration just added.
 */
const finalizeRecordMap = async (
  recordMap: ExtendedRecordMap,
): Promise<ExtendedRecordMap> => {
  const hydrated = enableGroupedCollectionHydration
    ? await hydrateGroupedCollectionData(recordMap)
    : recordMap;

  if (isPreviewImageSupportEnabled) {
    hydrated.preview_images = await getPreviewImageMap(hydrated);
  }

  return hydrated;
};

/**
 * Test-only handles on the page cache. Exported because the expiry rule this
 * module enforces — a deadline set on write and never moved by a read — is only
 * observable over time, and a test that cannot advance the clock past it would
 * assert the comment rather than the behaviour.
 */
export const __pageCacheInternals = {
  getPageCacheKey,
  getCachedRecordMapFromMemory,
  setCachedRecordMapInMemory,
  clear: () => memoryPageCache.clear(),
  size: () => memoryPageCache.size,
};

export async function getPage(pageId: string): Promise<ExtendedRecordMap> {
  const cacheKey = getPageCacheKey(pageId);

  if (isNotionPageCacheEnabled) {
    // A cache HIT must never re-write the entry. Re-writing restarts the TTL,
    // which turns an N-second cache into a sliding one: while the page is
    // requested more often than N — and ISR alone re-renders every 60s — the
    // entry never expires and Notion is never read again. That is how
    // jackhpark.com served a mindmap revision months after Notion had moved on,
    // and why a Notion edit on 2026-08-30 had still not appeared 10 minutes and
    // a dozen requests later. The deadline has to be absolute: set on write,
    // untouched by reads.
    const memoryCached = getCachedRecordMapFromMemory(cacheKey);
    if (memoryCached) {
      return enableGroupedCollectionHydration
        ? finalizeRecordMap(memoryCached)
        : memoryCached;
    }

    const persistentCached = await readCachedRecordMap(cacheKey);
    if (persistentCached) {
      return enableGroupedCollectionHydration
        ? finalizeRecordMap(persistentCached)
        : persistentCached;
    }
  }

  const existingFetch = inFlightPageFetches.get(cacheKey);

  if (existingFetch) {
    return existingFetch;
  }

  const fetchPromise = (async () => {
    const recordMap = await loadPageFromNotion(pageId);
    const finalRecordMap = await finalizeRecordMap(recordMap);

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
