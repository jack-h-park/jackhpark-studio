"use client";

import { type PageBlock } from "notion-types";
import type { ExtendedRecordMap } from "notion-types";
import { getPageProperty } from "notion-utils";
import * as React from "react";

import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/admin/ingestion-formatters";
import { getVisiblePropertyIdsForPage } from "@/lib/notion/getVisiblePropertyIds";
import { getPageCollectionId } from "@/lib/notion/getPageCollectionId";

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
  month: "short",
  day: "numeric",
  year: "numeric",
});

const normalizeId = (id?: string | null): string | undefined =>
  id?.replace(/-/g, "");

const normalizeSchemaName = (name?: string): string =>
  name?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";

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

  const direct = block.properties?.[propertyId];
  if (direct !== undefined) {
    return direct;
  }

  const normalized = normalizeId(propertyId);
  if (normalized && normalized !== propertyId) {
    return block.properties?.[normalized] ?? null;
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
  const blockValue = getRawPropertyValue(block, propertyId);
  const schemaType = schemaEntry?.type;
  const normalizedName = normalizeSchemaName(schemaEntry?.name);

  const notationValue = getPageProperty(propertyId, block, recordMap);
  const notationDisplay = formatPropertyValue(notationValue, schemaType);
  const shouldPreferNotation =
    schemaType === PropertyType.Date || PREFERRED_LABELS.has(normalizedName);

  if (shouldPreferNotation && notationDisplay && !isDisplayEmpty(notationDisplay)) {
    return {
      raw: notationValue,
      from: "notion-utils",
      display: notationDisplay,
      isEmpty: isDisplayEmpty(notationDisplay),
      hasBlockValue: Boolean(blockValue),
    };
  }

  if (blockValue !== null && blockValue !== undefined) {
    const formatted = formatPropertyValue(blockValue, schemaType);
    const fallbackText = extractPlainTextFromNotionProp(blockValue);
    const display = formatted ?? (fallbackText ? fallbackText : null);
    const isEmpty = isDisplayEmpty(display);

    const shouldWarn =
      process.env.NODE_ENV !== "production" &&
      shouldPreferNotation &&
      typeof display === "string" &&
      display.length <= 2;

    if (shouldWarn) {
      console.debug("[PageVisibleProperties] suspicious short value", {
        propertyId,
        schemaName: schemaEntry?.name,
        rawPreview: safeStringify(blockValue),
        extracted: display,
      });
    }

    const cleanedDisplay =
      shouldPreferNotation &&
      typeof display === "string" &&
      display.length <= 2
        ? null
        : display;

    if (cleanedDisplay && !isDisplayEmpty(cleanedDisplay)) {
      return {
        raw: blockValue,
        from: "block",
        display: cleanedDisplay,
        isEmpty: isDisplayEmpty(cleanedDisplay),
        hasBlockValue: true,
      };
    }
  }

  return {
    raw: notationValue ?? blockValue,
    from: "notion-utils",
    display: notationDisplay,
    isEmpty: isDisplayEmpty(notationDisplay),
    hasBlockValue: Boolean(blockValue),
  };
};

const LABEL_OVERRIDES: Record<string, string> = {
  published: "Posted on",
};

const PREFERRED_LABELS = new Set(["published", "posted on"]);

const isInternalSchemaName = (name?: string): boolean =>
  Boolean(name?.trim().startsWith("_"));

type CollectionSchemaEntry = CollectionSchema[string];

const shouldIncludeSchemaEntry = (
  schemaEntry?: CollectionSchemaEntry | null,
  includeInternalFlag = false,
  propertyId?: string,
  explicitlyVisible = false,
): boolean => {
  if (!schemaEntry?.name) {
    return true;
  }

  if (!includeInternalFlag && isInternalSchemaName(schemaEntry.name)) {
    return false;
  }

  const normalized = normalizeSchemaName(schemaEntry.name);

  if (!includeInternalFlag && normalized === "name") {
    return false;
  }

  if (
    !includeInternalFlag &&
    propertyId === "created_time" &&
    !explicitlyVisible
  ) {
    return false;
  }

  return true;
};

const getDisplayLabel = (
  schemaEntry: CollectionSchemaEntry | undefined,
  propertyId: string,
): string => {
  const normalized = normalizeSchemaName(schemaEntry?.name);
  return LABEL_OVERRIDES[normalized] ?? schemaEntry?.name ?? propertyId;
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

const CLEAN_DATE_SUFFIX_REGEX =
  /(?:,\s*\d{1,2}:\d{2}\s*(?:AM|PM)?|\s+at\s.*)$/i;

const findDateCandidate = (value: unknown): string | number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number" || typeof value === "string") {
    return value;
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
      return plainText;
    }
  }

  return null;
};

const formatDateCandidate = (value: unknown): string | null => {
  const candidate = findDateCandidate(value);
  if (candidate === null) {
    return null;
  }

  const date =
    candidate instanceof Date
      ? candidate
      : typeof candidate === "number"
      ? new Date(candidate)
      : new Date(String(candidate));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatted = formatDate(date.toISOString());
  const cleaned = formatted.replace(CLEAN_DATE_SUFFIX_REGEX, "").trim();

  return cleaned || DATE_FORMATTER.format(date);
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
      .map((entry) => formatDateCandidate(entry))
      .filter((item): item is string => Boolean(item));

    if (formatted.length === 0) {
      return null;
    }

    return formatted.join(" - ");
  }

  if (schemaType === PropertyType.Checkbox && typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    const visible = value
      .map((item) => formatPropertyValue(item, schemaType))
      .filter((item): item is string => typeof item === "string" && item.trim());

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

export function PageVisibleProperties({
  recordMap,
  pageId,
  className,
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
    return recordMap.collection?.[collectionId]?.value ?? null;
  }, [collectionId, recordMap]);

  const collectionSchema = (collectionEntry?.schema ?? null) as CollectionSchema | null;

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
    return new Set([
      ...DEFAULT_EXCLUDED_TYPES,
      ...(excludeTypes ?? []),
    ]);
  }, [excludeTypes]);

  const excludeIdSet = React.useMemo(
    () => new Set((excludePropertyIds ?? []).map((id) => id ?? "")),
    [excludePropertyIds],
  );

  const prioritizedPropertyIds = React.useMemo(() => {
    const baseIds = includePropertyIds && includePropertyIds.length > 0
      ? includePropertyIds
      : visibleResolvedIds;

    const filtered = dedupePropertyIds(baseIds).filter((propertyId) => {
      if (!propertyId || !collectionSchema?.[propertyId]) {
        return false;
      }

      if (excludeIdSet.has(propertyId)) {
        return false;
      }

      const schemaEntry = collectionSchema[propertyId];
      if (!schemaEntry) {
        return false;
      }

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

      if (excludeTypeSet.has(schemaEntry.type)) {
        return false;
      }

      return true;
    });

    if (filtered.length > 0) {
      return orderWithPreferred(filtered, collectionSchema);
    }

    if (!collectionSchema) {
      return [];
    }

    return orderWithPreferred(
      Object.keys(collectionSchema).filter((propertyId) => {
        if (!propertyId) return false;
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
        ) {
          return false;
        }
        if (excludeTypeSet.has(schemaEntry.type)) return false;
        return true;
      }, collectionSchema),
    );
  }, [
    includePropertyIds,
    visibleResolvedIds,
    collectionSchema,
    excludeIdSet,
    excludeTypeSet,
    includeInternal,
  ]);

  const propertyRenderState = React.useMemo(() => {
    if (!block || !recordMap || !collectionSchema) {
      return {
        entries: [],
        resolvedDetails: [] as EvaluationDetail[],
        fallbackDetails: [] as EvaluationDetail[],
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
    };

    const seen = new Set<string>();

    const buildEntry = (
      detail: EvaluationDetail,
      target: RenderEntry[],
    ): boolean => {
      if (detail.isEmpty || !detail.display) {
        return false;
      }

      if (seen.has(detail.propertyId)) {
        return false;
      }

      seen.add(detail.propertyId);
      target.push({
        propertyId: detail.propertyId,
        label: detail.label,
        value: detail.display,
      });

      return true;
    };

    const resolvedEntries: RenderEntry[] = [];
    prioritizedDetails.forEach((detail) =>
      buildEntry(detail, resolvedEntries),
    );

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
            false,
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
            false,
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

    return { entries: entriesToRender, resolvedDetails, fallbackDetails };
  }, [
    block,
    collectionSchema,
    prioritizedPropertyIds,
    recordMap,
    visibleResolvedIds,
    includeInternal,
  ]);

  const renderedProperties = propertyRenderState.entries;
  const resolvedDetails = propertyRenderState.resolvedDetails;
  const fallbackDetails = propertyRenderState.fallbackDetails;

  const dev =
    typeof process !== "undefined" &&
    process.env.NODE_ENV !== "production";

  React.useEffect(() => {
    if (
      process.env.NODE_ENV === "production" ||
      !recordMap ||
      !collectionId
    ) {
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
      visibleIdsRawCount: visibleRawIds.length,
      visibleIdsRawSample: visibleRawIds.slice(0, 5),
      resolvedIdsCount: visibleResolvedIds.length,
      resolvedIdsSample: visibleResolvedIds.slice(0, 5),
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
