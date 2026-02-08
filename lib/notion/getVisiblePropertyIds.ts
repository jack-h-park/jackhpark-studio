import {
  type CollectionViewPageBlock,
  type ExtendedRecordMap,
} from "notion-types";

import { getPageCollectionId } from "./getPageCollectionId";

type PropertyEntry = string | Record<string, any>;

const normalizeId = (id?: string | null): string | undefined =>
  id?.replaceAll("-", "");

const normalizeName = (value?: string): string =>
  value?.trim()?.replaceAll(/\s+/g, " ")?.toLowerCase() ?? "";

const getPropertyId = (entry: PropertyEntry): string | undefined => {
  if (!entry) return undefined;
  if (typeof entry === "string") return entry;
  return (
    entry.property ??
    entry.property_id ??
    entry.propertyId ??
    entry.id ??
    undefined
  );
};

const isHiddenEntry = (entry: PropertyEntry): boolean => {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  if (entry.visible === false) {
    return true;
  }

  const visibility = entry.visibility;
  if (typeof visibility === "string") {
    return visibility.toLowerCase() === "hide";
  }

  return false;
};

const extractIds = (entries: unknown, skipHidden = true): string[] => {
  if (!Array.isArray(entries)) {
    return [];
  }

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const entry of entries) {
    const propertyId = getPropertyId(entry as PropertyEntry);
    if (!propertyId) {
      continue;
    }

    if (skipHidden && isHiddenEntry(entry as PropertyEntry)) {
      continue;
    }

    if (seen.has(propertyId)) {
      continue;
    }

    seen.add(propertyId);
    ids.push(propertyId);
  }

  return ids;
};

export type VisiblePropertyResult = {
  resolvedIds: string[];
  rawIds: string[];
};

export function getVisiblePropertyIdsForPage(
  recordMap?: ExtendedRecordMap | null,
  pageId?: string | null,
): VisiblePropertyResult {
  if (!recordMap || !pageId) {
    return { resolvedIds: [], rawIds: [] };
  }

  const block = (() => {
    const candidate = recordMap.block?.[pageId];
    if (candidate?.value) {
      return candidate.value;
    }

    const normalized = normalizeId(pageId);
    if (!normalized) {
      return null;
    }

    return recordMap.block?.[normalized]?.value ?? null;
  })();
  if (!block) {
    return { resolvedIds: [], rawIds: [] };
  }

  const collectionId = getPageCollectionId(recordMap, pageId);
  if (!collectionId) {
    return { resolvedIds: [], rawIds: [] };
  }

  if (process.env.NODE_ENV !== "production") {
    const viewKeys = Object.keys(recordMap.collection_view ?? {});
    const viewPageBlocks = Object.values(recordMap.block ?? {}).filter(
      (entry) => entry?.value?.type === "collection_view_page",
    );

    console.log("[getVisiblePropertyIdsForPage]", {
      pageId,
      collectionId,
      collectionViewCount: viewKeys.length,
      collectionViewPageBlocks: viewPageBlocks.length,
    });
  }

  const viewPageBlock = Object.values(recordMap.block ?? {}).find(
    (entry) =>
      entry?.value?.type === "collection_view_page" &&
      entry.value?.collection_id === collectionId,
  );

  const viewBlock = viewPageBlock?.value as CollectionViewPageBlock | undefined;
  const viewId = viewBlock?.view_ids?.[0];

  let targetView = viewId
    ? recordMap.collection_view?.[viewId]?.value
    : undefined;

  if (!targetView) {
    targetView = Object.values(recordMap.collection_view ?? {})
      .map((entry) => entry?.value)
      .find(Boolean) as any;
  }

  if (!targetView) {
    return { resolvedIds: [], rawIds: [] };
  }

  const viewFormat = targetView.format ?? {};
  const collection = recordMap.collection?.[collectionId]?.value;
  const collectionFormat = collection?.format ?? {};
  const schema = collection?.schema ?? {};

  const strategies: Array<{
    name: string;
    entries?: unknown;
  }> = [
    {
      name: "view.collection_page_properties",
      entries: viewFormat.collection_page_properties,
    },
    {
      name: "collection.collection_page_properties",
      entries: collectionFormat.collection_page_properties,
    },
    {
      name: "view.property_visibility",
      entries: viewFormat.property_visibility,
    },
    {
      name: "view.table_properties",
      entries: viewFormat.table_properties,
    },
  ];

  let strategyUsed: string | null = null;
  let visibleIdsRaw: string[] = [];

  for (const strategy of strategies) {
    const ids = extractIds(strategy.entries, true);
    if (ids.length > 0) {
      strategyUsed = strategy.name;
      visibleIdsRaw = ids;
      break;
    }
  }

  const schemaNameMap = new Map<string, string>();
  for (const [id, schemaEntry] of Object.entries(schema ?? {})) {
    if (!schemaEntry?.name) continue;
    const normalized = normalizeName(schemaEntry.name);
    if (normalized) {
      schemaNameMap.set(normalized, id);
    }
  }

  const seen = new Set<string>();
  const resolvedIds: string[] = [];

  for (const rawId of visibleIdsRaw) {
    let candidateId: string | undefined;

    if (schema[rawId]) {
      candidateId = rawId;
    } else {
      const normalizedRaw = normalizeName(rawId);
      candidateId = schemaNameMap.get(normalizedRaw);
    }

    if (!candidateId) {
      continue;
    }

    if (!schema[candidateId]) {
      continue;
    }

    if (seen.has(candidateId)) {
      continue;
    }

    seen.add(candidateId);
    resolvedIds.push(candidateId);
  }

  if (resolvedIds.length === 0) {
    const fallbackNames = new Set(["published", "posted on", "date"]);
    for (const [id, schemaEntry] of Object.entries(schema ?? {})) {
      const normalized = normalizeName(schemaEntry?.name);
      if (fallbackNames.has(normalized)) {
        resolvedIds.push(id);
        if (!visibleIdsRaw.includes(normalized)) {
          visibleIdsRaw.push(schemaEntry?.name ?? id);
        }
        break;
      }
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const schemaSample = Object.entries(schema)
      .slice(0, 10)
      .map(([key, value]) => ({
        id: key,
        name: value?.name,
      }));

    console.log("[getVisiblePropertyIdsForPage][strategy]", {
      pageId,
      collectionId,
      viewId,
      strategy: strategyUsed,
      visibleIdsRaw: visibleIdsRaw.slice(0, 10),
      resolvedIds,
      schemaSample,
    });
  }

  return {
    resolvedIds,
    rawIds: visibleIdsRaw,
  };
}
