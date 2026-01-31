"use client";

import { type ExtendedRecordMap, type PageBlock } from "notion-types";
import { getPageProperty } from "notion-utils";
import * as React from "react";

import { getPageCollectionId } from "@/lib/notion/getPageCollectionId";
import { getVisiblePropertyIdsForPage } from "@/lib/notion/getVisiblePropertyIds";
import { cn } from "@/lib/utils";

import styles from "./PageVisibleProperties.module.css";

const DEFAULT_EXCLUDED_TYPES = new Set([
  "title",
  "relation",
  "rollup",
  "formula",
  "files",
]);

enum PropertyType {
  Checkbox = "checkbox",
  Date = "date",
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "numeric",
});

const normalizeId = (id?: string | null): string | undefined =>
  id?.replaceAll("-", "");

const normalizeSchemaName = (name?: string): string =>
  name?.trim().replaceAll(/\s+/g, " ").toLowerCase() ?? "";

const isDisplayEmpty = (display: React.ReactNode | null): boolean => {
  if (display === null || display === undefined) {
    return true;
  }

  if (typeof display === "string") {
    return display.trim().length === 0;
  }

  return false;
};

type PropValueSource = "block" | "notion-utils";

type PropValueResult = {
  raw: unknown;
  from: PropValueSource;
  display: React.ReactNode | null;
  isEmpty: boolean;
  hasBlockValue: boolean;
};

type EvaluationDetail = {
  propertyId: string;
  label: string;
  schemaType?: string;
  display: React.ReactNode | null;
  isEmpty: boolean;
  raw: unknown;
  from: PropValueSource;
  fallbackUsed: boolean;
  hasBlockValue: boolean;
};

type CollectionSchema = Record<
  string,
  {
    name?: string;
    type?: string;
  }
>;

const getRawPropertyValue = (
  block?: PageBlock | null,
  propertyId?: string | null,
): unknown | null => {
  if (!block || !propertyId) {
    return null;
  }

  const direct = (block.properties as any)?.[propertyId];
  if (direct !== undefined) {
    return direct;
  }

  const normalized = normalizeId(propertyId);
  if (normalized && normalized !== propertyId) {
    return (block.properties as any)?.[normalized] ?? null;
  }

  return null;
};

const getRawFromBlockProperties = (
  block: PageBlock,
  schemaName: string,
): unknown | null => {
  if (!block?.properties) return null;
  const props = block.properties as any;
  // Try exact match first
  if (props[schemaName]) return props[schemaName];

  // Try case-insensitive scan (expensive but safe for small property sets)
  const lowername = schemaName.toLowerCase();
  for (const key of Object.keys(props)) {
    if (key.toLowerCase() === lowername) {
      return props[key];
    }
  }
  return null;
};

const extractPlainTextFromNotionProp = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (!Array.isArray(value)) {
    return "";
  }

  const parts: string[] = [];
  for (const segment of value) {
    if (typeof segment === "string") {
      parts.push(segment.trim());
      continue;
    }

    if (Array.isArray(segment) && typeof segment[0] === "string") {
      parts.push(segment[0].trim());
    }
  }

  return parts.join("").trim();
};

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
};

const getPropValue = (
  recordMap: ExtendedRecordMap,
  block: PageBlock,
  schemaEntry: { type?: string; name?: string } | null,
  propertyId: string,
): PropValueResult => {
  let blockValue: unknown = null;
  const schemaType = schemaEntry?.type;
  const schemaName = schemaEntry?.name;

  // 1. Handle metadata properties that live on the block
  if (schemaType && block) {
    if (schemaType === "created_time") {
      blockValue = block.created_time;
    } else if (schemaType === "last_edited_time") {
      blockValue = block.last_edited_time;
    } else if (schemaType === "created_by") {
      blockValue = block.created_by_id;
    } else if (schemaType === "last_edited_by") {
      blockValue = block.last_edited_by_id;
    }
  }

  // 2. Handle standard properties via name lookup if not found in metadata
  if (blockValue === null && schemaName && block) {
    blockValue = getRawFromBlockProperties(block, schemaName);
  }

  // Fallback to ID-based lookup if name lookup failed
  if (blockValue === null) {
    blockValue = getRawPropertyValue(block, propertyId);
  }

  // Dev log for verification
  if (process.env.NODE_ENV !== "production") {
    // Logging removed for cleanup
  }

  // 3. Formatting
  let display: React.ReactNode | null = null;

  if (
    schemaType === "date" ||
    schemaType === "created_time" ||
    schemaType === "last_edited_time"
  ) {
    const includeTime = schemaType.includes("time");
    display = formatDateValue(blockValue, includeTime);
  } else if (blockValue !== null) {
    const formatted = formatPropertyValue(blockValue, schemaType);
    const fallbackText = extractPlainTextFromNotionProp(blockValue);
    display = formatted ?? (fallbackText || null);
  } else {
    // Try legacy notion-utils accessor as last resort
    const lookupId = schemaName ?? propertyId;
    const avgValue = getPageProperty(lookupId, block, recordMap);
    display = formatPropertyValue(avgValue, schemaType);
  }

  // 4. Return result
  return {
    raw: blockValue,
    from: "block",
    display,
    isEmpty: isDisplayEmpty(display),
    hasBlockValue: blockValue !== null,
  };
};

const PREFERRED_LABELS = new Set(["published", "posted on"]);

const isInternalSchemaName = (name?: string): boolean =>
  Boolean(name?.trim().startsWith("_"));

type CollectionSchemaEntry = CollectionSchema[string];

const formatDateValue = (
  value: unknown,
  includeTime = false,
): string | null => {
  const candidate = findDateCandidate(value);
  if (candidate === null) return null;

  // Fix timezone shift for YYYY-MM-DD strings
  // "2026-01-04" is parsed as UTC midnight, which is previous day in US timezones.
  // We want to treat it as a "visual date" regardless of timezone.
  let date: Date;
  if (
    typeof candidate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.trim())
  ) {
    const [y, m, d] = candidate.trim().split("-").map(Number);
    date = new Date(y, m - 1, d); // Local midnight
  } else {
    date =
      typeof candidate === "number"
        ? new Date(candidate)
        : new Date(String(candidate));
  }

  if (Number.isNaN(date.getTime())) return null;

  if (includeTime) {
    // Intl often puts " at " or similar. User wants "December 12, 2025 11:34 PM"
    return DATE_TIME_FORMATTER.format(date).replace(" at ", " ");
  }

  return DATE_FORMATTER.format(date);
};

const formatPropertyValue = (
  value: unknown,
  schemaType?: string,
): React.ReactNode | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (schemaType === PropertyType.Date) {
    const inputs = Array.isArray(value) ? value : [value];
    const formatted = inputs
      .map((entry) => formatDateValue(entry, false))
      .filter(Boolean);

    if (formatted.length === 0) {
      return null;
    }

    return formatted.join(" - ");
  }
  // ... unchanged ...
  if (schemaType === PropertyType.Checkbox && typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  // Handle Select / Multi-Select (render as pills)
  if (schemaType === "select" || schemaType === "multi_select") {
    // The recursive array handler below might interfere if we don't catch it here.
    // But `schemaType` is passed down.

    // Let's look at the existing Array handler loop below:
    // It maps formatPropertyValue over items.

    // If we want to intercept Select/MultiSelect specifically:

    if (Array.isArray(value)) {
      // Flatten Notion's structure: [["A"], [","], ["B"]]
      const parts: React.ReactNode[] = [];
      for (const [i, segment] of value.entries()) {
        // segment is ["Value", [mod]] or [","] or just ["Value"]
        // If pure string: segment "A"

        let text = "";
        if (Array.isArray(segment)) {
          if (typeof segment[0] === "string") text = segment[0];
        } else if (typeof segment === "string") {
          text = segment;
        }

        if (!text || text.trim() === "" || text === ",") continue;

        parts.push(
          <span key={i} className={styles.pill}>
            {text}
          </span>,
        );
      }

      if (parts.length > 0) return <>{parts}</>;
      return <span className={styles.empty}>Empty</span>;
    }

    // Fallback for single object/string
    const text = extractPlainTextFromNotionProp(value);
    if (text && text.trim().length > 0) {
      return <span className={styles.pill}>{text}</span>;
    }
    return <span className={styles.empty}>Empty</span>;
  }

  if (Array.isArray(value)) {
    const visible = value
      .map((item) => formatPropertyValue(item, schemaType))
      .filter(
        (item): item is string => typeof item === "string" && !!item.trim(),
      );

    if (visible.length === 0) {
      return null;
    }

    return visible.join(" · ");
  }

  if (typeof value === "object") {
    const candidate =
      (value as { name?: string; title?: string; value?: string }).name ??
      (value as { name?: string; title?: string; value?: string }).title ??
      (value as { label?: string }).label;

    if (candidate) {
      return candidate;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  return value?.toString?.() ?? null;
};

const resolveBlock = (
  recordMap: ExtendedRecordMap,
  pageId: string,
): PageBlock | null => {
  const entry = recordMap.block?.[pageId];
  if (entry?.value) {
    return entry.value as PageBlock;
  }

  const normalized = normalizeId(pageId);
  if (!normalized) {
    return null;
  }

  return (recordMap.block?.[normalized]?.value as PageBlock) ?? null;
};

type PageVisiblePropertiesProps = {
  recordMap?: ExtendedRecordMap | null;
  pageId?: string | null;
  className?: string;
  includePropertyIds?: string[];
  excludePropertyIds?: string[];
  excludeTypes?: string[];
  includeInternal?: boolean;
};
// ...
const shouldIncludeSchemaEntry = (
  schemaEntry?: CollectionSchemaEntry | null,
  includeInternalFlag = false,
  propertyId?: string,
  explicitlyVisible = false,
): boolean => {
  if (!schemaEntry?.name) {
    return true;
  }

  // If explicitly requested/visible via View, allow it even if internal name
  if (explicitlyVisible) {
    return true;
  }

  if (!includeInternalFlag && isInternalSchemaName(schemaEntry.name)) {
    // Exception: whitelist specific internal properties user wants to see
    const lowerName = schemaEntry.name.toLowerCase();
    const whitelist = ["_doc_type", "_persona_type"];
    if (!whitelist.includes(lowerName)) {
      return false;
    }
  }

  const normalized = normalizeSchemaName(schemaEntry.name);

  if (!includeInternalFlag && normalized === "name") {
    return false;
  }

  // created_time is metadata, only show if explicitly asked (handled by explicitlyVisible check above usually,
  // but logic here was trying to hide it if NOT explicitly visible)
  if (
    !includeInternalFlag &&
    propertyId === "created_time" &&
    !explicitlyVisible
  ) {
    return false;
  }

  return true;
};

const orderWithPreferred = (
  ids: string[],
  schema: CollectionSchema | null,
): string[] => {
  if (!schema) {
    return ids;
  }

  const preferred: string[] = [];
  const others: string[] = [];

  for (const id of ids) {
    if (!id) continue;
    const normalized = normalizeSchemaName(schema[id]?.name);
    if (PREFERRED_LABELS.has(normalized)) {
      preferred.push(id);
    } else {
      others.push(id);
    }
  }

  const uniqueOthers = others.filter((id) => !preferred.includes(id));
  return [...preferred, ...uniqueOthers];
};

const dedupePropertyIds = (ids: Array<string | undefined | null>) => {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }
  return deduped;
};

const findDateCandidate = (value: unknown): string | number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    // Only return if it looks like a valid date
    // This allows recursion to continue if we hit a formatting symbol like "‣"
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return value;
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = findDateCandidate(item);
      if (candidate !== null) {
        return candidate;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const candidate =
      (value as Record<string, unknown>).start_date ??
      (value as Record<string, unknown>).date ??
      (value as Record<string, unknown>).value ??
      (value as Record<string, unknown>).begin ??
      (value as Record<string, unknown>).end ??
      null;
    if (candidate !== null) {
      return findDateCandidate(candidate);
    }

    const plainText = extractPlainTextFromNotionProp(value);
    if (plainText) {
      // Check if the extracted text itself is a date
      const d = new Date(plainText);
      if (!Number.isNaN(d.getTime())) {
        return plainText;
      }
    }
  }

  return null;
};

export function usePageVisibleProperties({
  recordMap,
  pageId,
  includePropertyIds,
  excludePropertyIds,
  excludeTypes,
  includeInternal = false,
}: PageVisiblePropertiesProps) {
  const block = React.useMemo(() => {
    if (!recordMap || !pageId) return null;
    return resolveBlock(recordMap, pageId);
  }, [recordMap, pageId]);

  const collectionId = React.useMemo(() => {
    if (!recordMap || !pageId) return null;
    return getPageCollectionId(recordMap, pageId);
  }, [pageId, recordMap]);

  const collectionEntry = React.useMemo(() => {
    if (!recordMap || !collectionId) return null;
    const direct = recordMap.collection?.[collectionId]?.value;
    if (direct) return direct;
    const normalized = normalizeId(collectionId);
    return (
      (normalized ? recordMap.collection?.[normalized]?.value : null) ?? null
    );
  }, [collectionId, recordMap]);

  const collectionSchema = (collectionEntry?.schema ??
    null) as CollectionSchema | null;

  const visiblePropertyResult = React.useMemo(() => {
    if (!recordMap || !pageId) {
      return { resolvedIds: [], rawIds: [] };
    }
    return getVisiblePropertyIdsForPage(recordMap, pageId);
  }, [pageId, recordMap]);

  const visibleResolvedIds = visiblePropertyResult.resolvedIds;
  const visibleRawIds = visiblePropertyResult.rawIds;

  const explicitVisibleSet = React.useMemo(() => {
    const set = new Set<string>();
    for (const id of visibleResolvedIds) {
      if (id) set.add(id);
    }
    for (const id of includePropertyIds ?? []) {
      if (id) set.add(id);
    }
    return set;
  }, [visibleResolvedIds, includePropertyIds]);

  const excludeTypeSet = React.useMemo(() => {
    return new Set([...DEFAULT_EXCLUDED_TYPES, ...(excludeTypes ?? [])]);
  }, [excludeTypes]);

  const excludeIdSet = React.useMemo(
    () => new Set((excludePropertyIds ?? []).map((id) => id ?? "")),
    [excludePropertyIds],
  );

  const prioritizedPropertyIds = React.useMemo(() => {
    let baseIds =
      includePropertyIds && includePropertyIds.length > 0
        ? [...includePropertyIds]
        : [...visibleResolvedIds];

    if (collectionSchema) {
      // 1. Identify key IDs for specific ordering
      let postedOnId: string | undefined;
      let createdId: string | undefined;
      let tagsId: string | undefined;
      const customInternalIds: string[] = [];
      const forceCandidates = new Set([
        "posted on",
        "published",
        "_doc_type",
        "_persona_type",
      ]);

      // Map schema to roles
      for (const [id, s] of Object.entries(collectionSchema)) {
        const n = normalizeSchemaName(s.name);

        if (forceCandidates.has(n)) {
          // Ensure it's in baseIds if force-included
          if (!baseIds.includes(id)) baseIds.push(id);
        }

        if (n === "posted on" || n === "published") postedOnId = id;
        else if (n === "created") createdId = id;
        else if (n === "tags") tagsId = id;
        else if (n === "_doc_type" || n === "_persona_type")
          customInternalIds.push(id);
      }

      // 2. Separate IDs into buckets
      // We want: PostedOn -> Created -> Tags -> CustomInternal -> Rest
      const newOrder: string[] = [];
      const usedIds = new Set<string>();

      const addId = (id?: string) => {
        if (id && !usedIds.has(id)) {
          newOrder.push(id);
          usedIds.add(id);
        }
      };

      // Posted On
      addId(postedOnId);

      // Created (Schema property OR metadata if in list)
      addId(createdId);
      if (baseIds.includes("created_time")) addId("created_time");

      // Tags
      addId(tagsId);

      // Custom Internal - Sort them explicitly to match reference (_doc_type then _persona_type)
      customInternalIds.sort((a, b) => {
        const nameA = normalizeSchemaName(collectionSchema[a]?.name || "");
        const nameB = normalizeSchemaName(collectionSchema[b]?.name || "");
        return nameA.localeCompare(nameB);
      });
      for (const id of customInternalIds) addId(id);

      // Remainder from baseIds
      for (const id of baseIds) {
        if (!usedIds.has(id)) newOrder.push(id);
      }

      baseIds = newOrder;
    }

    const filtered = dedupePropertyIds(baseIds).filter((propertyId) => {
      if (!propertyId) return false;
      const schemaEntry = collectionSchema?.[propertyId];
      if (schemaEntry) {
        if (excludeIdSet.has(propertyId)) return false;
        if (
          !shouldIncludeSchemaEntry(
            schemaEntry,
            includeInternal,
            propertyId,
            explicitVisibleSet.has(propertyId),
          )
        ) {
          return false;
        }
        if (schemaEntry.type && excludeTypeSet.has(schemaEntry.type)) {
          return false;
        }
        return true;
      }

      // Allow metadata like 'created_time' if they were in the list
      if (propertyId === "created_time" || propertyId === "last_edited_time") {
        return true; // We want these if explicitly in the list or sorted in
      }

      return false;
    });

    if (filtered.length > 0) {
      return filtered;
    }

    if (!collectionSchema) {
      return [];
    }

    // Fallback if empty (should rare happen if we force props)
    return orderWithPreferred(
      Object.keys(collectionSchema).filter((propertyId) => {
        // Reuse same filter logic
        if (excludeIdSet.has(propertyId)) return false;
        const schemaEntry = collectionSchema[propertyId];
        if (!schemaEntry) return false;
        if (
          !shouldIncludeSchemaEntry(
            schemaEntry,
            includeInternal,
            propertyId,
            explicitVisibleSet.has(propertyId),
          )
        )
          return false;
        if (schemaEntry.type && excludeTypeSet.has(schemaEntry.type))
          return false;
        return true;
      }),
      collectionSchema,
    );
  }, [
    includePropertyIds,
    visibleResolvedIds,
    collectionSchema,
    excludeIdSet,
    excludeTypeSet,
    includeInternal,
    explicitVisibleSet,
  ]);

  const propertyRenderState = React.useMemo(() => {
    if (!block || !recordMap || !collectionSchema) {
      return {
        entries: [],
        resolvedDetails: [] as EvaluationDetail[],
        fallbackDetails: [] as EvaluationDetail[],
        prioritizedPropertyIds: [],
        visibleResolvedIds: [],
        visibleRawIds: [],
      };
    }

    const evaluationCache = new Map<string, EvaluationDetail>();

    const evaluateProperty = (
      propertyId: string,
      fallback = false,
    ): EvaluationDetail => {
      const cached = evaluationCache.get(propertyId);
      if (cached) {
        if (fallback && !cached.fallbackUsed) {
          const updated = { ...cached, fallbackUsed: true };
          evaluationCache.set(propertyId, updated);
          return updated;
        }
        return cached;
      }

      const schemaEntry = collectionSchema[propertyId];
      const label = schemaEntry?.name ?? propertyId;

      if (!schemaEntry) {
        const emptyDetail: EvaluationDetail = {
          propertyId,
          label,
          schemaType: undefined,
          display: null,
          isEmpty: true,
          raw: null,
          from: "notion-utils",
          fallbackUsed: fallback,
          hasBlockValue: false,
        };
        evaluationCache.set(propertyId, emptyDetail);
        return emptyDetail;
      }

      const result = getPropValue(recordMap, block, schemaEntry, propertyId);
      const detail: EvaluationDetail = {
        propertyId,
        label,
        schemaType: schemaEntry.type,
        display: result.display,
        isEmpty: result.isEmpty,
        raw: result.raw,
        from: result.from,
        fallbackUsed: fallback,
        hasBlockValue: result.hasBlockValue,
      };

      evaluationCache.set(propertyId, detail);
      return detail;
    };

    const resolvedDetails = visibleResolvedIds.map((propertyId) =>
      evaluateProperty(propertyId),
    );

    const prioritizedDetails = prioritizedPropertyIds.map((propertyId) =>
      evaluateProperty(propertyId),
    );

    type RenderEntry = {
      propertyId: string;
      label: string;
      value: React.ReactNode;
      schemaType?: string;
    };

    const seen = new Set<string>();

    const buildEntry = (
      detail: EvaluationDetail,
      target: RenderEntry[],
    ): boolean => {
      // Policy: skip empty values EXCEPT "Tags" (keep it even if empty)
      // We check if label is "Tags" (case-insensitive? or exact? usually "Tags")
      const isTags = detail.label === "Tags";

      if (detail.isEmpty && !isTags) {
        return false;
      }

      if (seen.has(detail.propertyId)) {
        return false;
      }

      seen.add(detail.propertyId);
      target.push({
        propertyId: detail.propertyId,
        label: detail.label,
        value:
          detail.isEmpty && isTags ? (
            <span className={styles.empty}>Empty</span>
          ) : (
            detail.display
          ),
        schemaType: detail.schemaType,
      });

      return true;
    };

    const resolvedEntries: RenderEntry[] = [];
    for (const detail of prioritizedDetails) {
      buildEntry(detail, resolvedEntries);
    }

    const fallbackDetails: EvaluationDetail[] = [];
    const fallbackEntries: RenderEntry[] = [];
    if (resolvedEntries.length === 0) {
      const fallbackOrder = ["published", "posted on", "date"];
      const fallbackQueue: string[] = [];

      for (const preference of fallbackOrder) {
        const candidate = Object.entries(collectionSchema).find(
          ([id, schemaEntry]) =>
            normalizeSchemaName(schemaEntry?.name) === preference &&
            shouldIncludeSchemaEntry(schemaEntry, includeInternal, id),
        );

        if (candidate) {
          const [candidateId] = candidate;
          if (!fallbackQueue.includes(candidateId)) {
            fallbackQueue.push(candidateId);
          }
        }
      }

      fallbackQueue.push(
        ...Object.keys(collectionSchema).filter((id) => {
          if (fallbackQueue.includes(id)) {
            return false;
          }
          const schemaEntry = collectionSchema[id];
          return shouldIncludeSchemaEntry(
            schemaEntry,
            includeInternal,
            id,
            explicitVisibleSet.has(id),
          );
        }),
      );

      for (const propertyId of fallbackQueue) {
        if (fallbackEntries.length >= 3) {
          break;
        }
        if (seen.has(propertyId)) {
          continue;
        }

        const schemaEntry = collectionSchema[propertyId];
        if (
          !shouldIncludeSchemaEntry(
            schemaEntry,
            includeInternal,
            propertyId,
            explicitVisibleSet.has(propertyId),
          )
        ) {
          continue;
        }

        const detail = evaluateProperty(propertyId, true);
        fallbackDetails.push(detail);
        buildEntry(detail, fallbackEntries);
      }
    }

    const entriesToRender =
      resolvedEntries.length > 0 ? resolvedEntries : fallbackEntries;

    return {
      entries: entriesToRender,
      resolvedDetails,
      fallbackDetails,
      block,
      recordMap,
      collectionId,
      collectionSchema,
      collectionEntry,
      visibleResolvedIds,
      visibleRawIds,
      prioritizedPropertyIds,
      prioritizedDetails, // Exposed for debugging
    };
  }, [
    block,
    collectionSchema,
    prioritizedPropertyIds,
    recordMap,
    visibleResolvedIds,
    includeInternal,
    prioritizedPropertyIds,
    explicitVisibleSet,
    visibleRawIds,
    collectionEntry,
  ]);

  return propertyRenderState;
}

export function PageVisibleProperties(props: PageVisiblePropertiesProps) {
  const { pageId, className } = props;
  const {
    entries: renderedProperties,
    resolvedDetails,
    fallbackDetails,
    recordMap,
    block,
    collectionId,
    collectionSchema,
    collectionEntry,
    visibleResolvedIds,
    visibleRawIds,
  } = usePageVisibleProperties(props);

  const dev =
    typeof process !== "undefined" && process.env.NODE_ENV !== "production";

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production" || !recordMap || !collectionId) {
      return;
    }

    const collectionViewCount = Object.keys(
      recordMap.collection_view ?? {},
    ).length;

    const collectionViewPageBlocks = Object.values(
      recordMap.block ?? {},
    ).filter((entry) => entry?.value?.type === "collection_view_page").length;

    const schemaKeysCount = collectionSchema
      ? Object.keys(collectionSchema).length
      : 0;

    const visibleSamples = visibleResolvedIds.slice(0, 3).map((propertyId) => {
      const schemaEntry = collectionSchema?.[propertyId];
      const rawValue =
        block && recordMap
          ? getPageProperty(propertyId, block, recordMap)
          : undefined;
      return {
        propertyId,
        label: schemaEntry?.name ?? propertyId,
        rawValue,
      };
    });

    const schemaSample = collectionSchema
      ? Object.entries(collectionSchema)
          .slice(0, 5)
          .map(([id, schemaEntry]) => ({
            id,
            name: schemaEntry?.name,
          }))
      : [];

    console.log("[PageVisibleProperties][debug]", {
      pageId,
      collectionId,
      collectionViewCount,
      collectionViewPageBlocks,
      resolvedIds: visibleResolvedIds,
      schemaKeysCount,
      schemaSample,
      resolvedSamples: visibleSamples,
      resolvedDetails: resolvedDetails.slice(0, 3).map((detail) => ({
        propertyId: detail.propertyId,
        label: detail.label,
        isEmpty: detail.isEmpty,
        display:
          typeof detail.display === "string"
            ? detail.display
            : detail.display
              ? "ReactNode"
              : null,
        from: detail.from,
        hasBlockValue: detail.hasBlockValue,
      })),
    });
  }, [
    block,
    collectionId,
    collectionSchema,
    pageId,
    recordMap,
    resolvedDetails,
    visibleResolvedIds,
  ]);

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[PageVisibleProperties] mounted", {
        pageId,
        visibleCount: renderedProperties.length,
      });
    }
  }, [pageId, renderedProperties.length]);

  if (renderedProperties.length === 0) {
    if (!dev) {
      return null;
    }

    const summarizeDetail = (detail: EvaluationDetail) => {
      const serialized = safeStringify(detail.raw);
      const display =
        typeof detail.display === "string"
          ? detail.display
          : detail.display
            ? "ReactNode"
            : null;

      return {
        propertyId: detail.propertyId,
        label: detail.label,
        schemaType: detail.schemaType,
        from: detail.from,
        fallbackUsed: detail.fallbackUsed,
        hasBlockValue: detail.hasBlockValue,
        isEmpty: detail.isEmpty,
        display,
        rawPreview:
          serialized.length > 200 ? `${serialized.slice(0, 200)}…` : serialized,
      };
    };

    const debugPayload = {
      pageId,
      parent_table: block?.parent_table,
      parent_id: block?.parent_id,
      collectionId,
      hasCollection: Boolean(collectionEntry),
      schemaCount: collectionSchema ? Object.keys(collectionSchema).length : 0,
      visibleIdsRawCount: visibleRawIds?.length ?? 0,
      visibleIdsRawSample: visibleRawIds?.slice(0, 5) ?? [],
      resolvedIdsCount: visibleResolvedIds?.length ?? 0,
      resolvedIdsSample: visibleResolvedIds?.slice(0, 5) ?? [],
      resolvedDetails: resolvedDetails.map(summarizeDetail),
      fallbackDetails: fallbackDetails.map(summarizeDetail),
    };

    return (
      <div
        style={{
          outline: "2px dashed orange",
          padding: 8,
          borderRadius: 8,
          background: "rgba(255, 165, 0, 0.1)",
          marginBottom: 8,
        }}
      >
        <strong>PROPS ROW: 0 items</strong>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 12,
            marginTop: 4,
          }}
        >
          {JSON.stringify(debugPayload, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className={cn(styles.propsRow, className)}>
      {dev && (
        <span
          className={styles.devMarker}
          data-debug="page-visible-properties-mounted"
          aria-hidden="true"
        />
      )}

      {renderedProperties.map(({ propertyId, label, value }) => (
        <div className={styles.propItem} key={propertyId}>
          <span className={styles.propLabel}>{label}</span>
          <span className={styles.propValue}>{value}</span>
        </div>
      ))}
    </div>
  );
}
