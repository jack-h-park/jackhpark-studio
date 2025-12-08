import { type Block, type Decoration, type ExtendedRecordMap } from "notion-types";
import { getPageContentBlockIds, getTextContent } from "notion-utils";

import { debugIngestionLog } from "@/lib/rag/debug";

import { mapImageUrl } from "../map-image-url";
import {
  DOC_TYPE_OPTIONS,
  normalizeMetadata,
  PERSONA_TYPE_OPTIONS,
  type RagDocumentMetadata,
} from "./metadata";

type NotionPropertyValue = Decoration[] | Decoration[][] | null | undefined;

type NotionPropertySchema = {
  name?: string | null;
  type?: string | null;
};

type PropertyLookup = {
  value: NotionPropertyValue;
  type?: string | null;
} | null;

function safeText(value: NotionPropertyValue): string | undefined {
  if (!value || !Array.isArray(value)) {
    return undefined;
  }

  try {
    const text = getTextContent(value as Decoration[]).trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function parseMultiSelect(value: NotionPropertyValue): string[] | undefined {
  if (!value || !Array.isArray(value)) {
    return undefined;
  }

  const parts: string[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry)) {
      continue;
    }
    const text = safeText(entry as Decoration[]);
    if (text) {
      parts.push(text);
    }
  }

  if (parts.length === 0) {
    return undefined;
  }

  const unique = Array.from(new Set(parts));
  unique.sort((a, b) => a.localeCompare(b));
  return unique;
}

function parseBoolean(value: NotionPropertyValue): boolean | undefined {
  const text = safeText(value);
  if (!text) {
    return undefined;
  }

  const normalized = text.toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseNumber(value: NotionPropertyValue): number | undefined {
  const text = safeText(value);
  if (!text) {
    return undefined;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function lookupProperty(
  recordMap: ExtendedRecordMap,
  pageId: string,
  propertyName: string,
): PropertyLookup {
  const page =
    (recordMap.block?.[pageId]?.value as {
      parent_id?: string;
      parent_table?: string;
      properties?: Record<string, NotionPropertyValue>;
    } | null) ?? null;

  if (!page) {
    return null;
  }

  const properties = page.properties ?? {};

  // Try collection schema lookup first (database properties).
  const collectionId =
    page.parent_table === "collection" ? page.parent_id ?? null : null;
  if (collectionId) {
    const collection =
      (recordMap.collection?.[collectionId]?.value as {
        schema?: Record<string, NotionPropertySchema>;
      } | null) ?? null;

    const schemaEntries = Object.entries(collection?.schema ?? {});
    const match = schemaEntries.find(
      ([, schema]) => schema?.name === propertyName,
    );

    if (match) {
      const [propertyId, schema] = match;
      const value = properties[propertyId];
      if (value !== undefined) {
        return { value, type: schema?.type };
      }
    }
  }

  // Fallback: direct property key on the page.
  if (properties[propertyName] !== undefined) {
    return { value: properties[propertyName], type: null };
  }

  return null;
}

function parsePropertyValue(
  raw: PropertyLookup,
  options?: { forceMulti?: boolean },
): string | string[] | boolean | number | undefined {
  if (!raw) {
    return undefined;
  }

  const { value, type } = raw;
  const forceMulti = options?.forceMulti ?? false;

  const typeHint = (type ?? "").toLowerCase();

  if (forceMulti || typeHint === "multi_select") {
    return parseMultiSelect(value);
  }

  if (typeHint === "checkbox") {
    return parseBoolean(value);
  }

  if (typeHint === "number") {
    return parseNumber(value);
  }

  if (typeHint === "select") {
    return safeText(value);
  }

  // Fallback: treat as rich text/title.
  return safeText(value);
}

export function extractNotionMetadata(
  recordMap: ExtendedRecordMap,
  pageId: string,
): RagDocumentMetadata {
  const docType = parsePropertyValue(
    lookupProperty(recordMap, pageId, "_doc_type"),
  );
  const personaType = parsePropertyValue(
    lookupProperty(recordMap, pageId, "_persona_type"),
  );
  const isPublic = parsePropertyValue(
    lookupProperty(recordMap, pageId, "_is_public"),
  );

  const tagsLookup = lookupProperty(recordMap, pageId, "_tags");
  let tags = parsePropertyValue(tagsLookup, { forceMulti: true });
  if (!tags && typeof tagsLookup?.type === "string") {
    // If Notion type isn't multi-select but a text list was provided, split on commas.
    const rawText = safeText(tagsLookup.value);
    if (rawText) {
      tags = rawText
        .split(/[,;]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  }

  const metadata: RagDocumentMetadata = {
    source_type: "notion",
  };

  if (typeof docType === "string" && docType) {
    if ((DOC_TYPE_OPTIONS as readonly string[]).includes(docType)) {
      metadata.doc_type = docType as any;
    }
  }
  if (typeof personaType === "string" && personaType) {
    if ((PERSONA_TYPE_OPTIONS as readonly string[]).includes(personaType)) {
      metadata.persona_type = personaType as any;
    }
  }
  if (typeof isPublic === "boolean") {
    metadata.is_public = isPublic;
  }
  if (Array.isArray(tags) && tags.length > 0) {
    metadata.tags = tags;
  }

  return normalizeMetadata(metadata) ?? { source_type: "notion" };
}

type NotionPageBlockValue = {
  parent_id?: string;
  parent_table?: string;
  properties?: { title?: Decoration[] };
  format?: { page_cover?: string | null };
  type?: string;
};

type ResolveNotionImageUrlArgs = {
  raw?: string | null;
  block?: Block | null;
  signedUrls?: Record<string, string>;
  skipColorTokens?: boolean;
  fallbackId?: string;
};

function resolveNotionImageUrl({
  raw,
  block,
  signedUrls,
  skipColorTokens = false,
  fallbackId,
}: ResolveNotionImageUrlArgs): string | null {
  const normalized = typeof raw === "string" ? raw.trim() : "";
  if (!normalized) {
    return null;
  }

  if (
    skipColorTokens &&
    (normalized.startsWith("color_") || normalized.startsWith("grad_"))
  ) {
    return null;
  }

  if (normalized.startsWith("http")) {
    return normalized;
  }

  if (block) {
    const mapped = mapImageUrl(normalized, block);
    if (mapped) {
      return mapped;
    }
  }

  const key = fallbackId ?? block?.id;
  const signedUrl = key ? signedUrls?.[key] : undefined;
  if (signedUrl) {
    return signedUrl;
  }

  if (process.env.NODE_ENV === "development" && normalized) {
    console.warn(
      "[notion-metadata] image present but cannot resolve URL",
      key ?? block?.id ?? null,
      normalized,
    );
  }

  return null;
}

function resolveNotionPageCoverUrl({
  recordMap,
  pageId,
}: {
  recordMap: ExtendedRecordMap;
  pageId: string;
}): string | null {
  const pageBlock =
    (recordMap.block?.[pageId]?.value as Block | null) ?? null;
  const rawCover = pageBlock?.format?.page_cover;
  return resolveNotionImageUrl({
    raw: rawCover,
    block: pageBlock,
    signedUrls: recordMap.signed_urls,
    skipColorTokens: true,
    fallbackId: pageId,
  });
}

function getBlockTitle(block: NotionPageBlockValue | null): string | null {
  if (!block?.properties?.title) {
    return null;
  }

  const text = getTextContent(block.properties.title).trim();
  return text || null;
}

function buildNotionBreadcrumb(
  recordMap: ExtendedRecordMap,
  pageId: string,
): string[] | undefined {
  const ancestors: string[] = [];
  const visited = new Set<string>();
  let cursorId: string | null = pageId;

  while (cursorId) {
    const block: NotionPageBlockValue | null =
      (recordMap.block?.[cursorId]?.value as NotionPageBlockValue | null) ?? null;
    const parentId: string | undefined = block?.parent_id;
    const parentTable: string | undefined = block?.parent_table;

    if (!parentId || visited.has(parentId) || parentId === cursorId) {
      break;
    }

    visited.add(parentId);

    const parentBlock =
      (recordMap.block?.[parentId]?.value as NotionPageBlockValue | null) ??
      null;
    if (!parentBlock) {
      break;
    }

    const ancestorTitle = getBlockTitle(parentBlock);
    if (ancestorTitle) {
      ancestors.unshift(ancestorTitle);
    }

    if (parentTable === "space") {
      break;
    }

    cursorId = parentId;
  }

  return ancestors.length > 0 ? ancestors : undefined;
}

function normalizeComparison(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function isSameText(first: string | null | undefined, second: string | null | undefined): boolean {
  const normalizedFirst = normalizeComparison(first);
  const normalizedSecond = normalizeComparison(second);

  if (!normalizedFirst || !normalizedSecond) {
    return false;
  }

  return normalizedFirst === normalizedSecond;
}

function shouldIncludeAsTeaser(block: Block): boolean {
  const allowedTypes = new Set([
    "paragraph",
    "bulleted_list",
    "numbered_list",
    "bulleted_list_item",
    "numbered_list_item",
    "callout",
    "quote",
    "toggle",
  ]);
  return block.type ? allowedTypes.has(block.type) : false;
}

function normalizeTeaserCandidate(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

function truncateTeaser(text: string): string {
  if (text.length > 280) {
    return `${text.slice(0, 280).trim()}…`;
  }
  return text;
}

function extractNotionTeaserText(
  recordMap: ExtendedRecordMap,
  pageId: string,
  pageTitle: string | null,
): string | undefined {
  const blockIds = getPageContentBlockIds(recordMap, pageId).toSorted();
  const bodyCandidates: string[] = [];
  let finalTeaser: string | undefined;

  for (const blockId of blockIds) {
    const block =
      (recordMap.block?.[blockId]?.value as Block | null) ?? null;
    if (!block || !shouldIncludeAsTeaser(block)) {
      continue;
    }

    const rawText = safeText(block.properties?.title ?? null);
    if (!rawText) {
      continue;
    }

    const normalized = normalizeTeaserCandidate(rawText);
    if (!normalized) {
      continue;
    }

    bodyCandidates.push(normalized);
    if (isSameText(normalized, pageTitle)) {
      continue;
    }

    finalTeaser = truncateTeaser(normalized);
    break;
  }

  debugIngestionLog("teaser-candidates", {
    pageId,
    pageTitle,
    bodyCandidates: bodyCandidates.slice(0, 5),
  });
  debugIngestionLog("teaser-final", {
    pageId,
    teaser: finalTeaser ?? null,
  });

  return finalTeaser;
}

function extractImageSourceFromBlock(block: Block): string | undefined {
  const sourceProperty = block.properties?.source;
  if (!Array.isArray(sourceProperty) || sourceProperty.length === 0) {
    return undefined;
  }

  const firstEntry = sourceProperty[0];
  if (!Array.isArray(firstEntry) || firstEntry.length === 0) {
    return undefined;
  }

  const candidate = firstEntry[0];
  return typeof candidate === "string" ? candidate.trim() : undefined;
}

function resolveFirstContentImageUrl({
  recordMap,
  pageId,
  signedUrls,
}: {
  recordMap: ExtendedRecordMap;
  pageId: string;
  signedUrls?: Record<string, string>;
}): string | null {
  const blockIds = getPageContentBlockIds(recordMap, pageId).toSorted();
  for (const blockId of blockIds) {
    if (blockId === pageId) {
      continue;
    }

    const block =
      (recordMap.block?.[blockId]?.value as Block | null) ?? null;
    if (!block || block.type !== "image") {
      continue;
    }

    const candidate =
      block.format?.display_source ?? extractImageSourceFromBlock(block);
    const resolved = resolveNotionImageUrl({
      raw: candidate,
      block,
      signedUrls,
      fallbackId: blockId,
      skipColorTokens: true,
    });

    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function buildNotionSourceMetadata(
  recordMap: ExtendedRecordMap,
  pageId: string,
): RagDocumentMetadata {
  const block =
    (recordMap.block?.[pageId]?.value as NotionPageBlockValue | null) ?? null;
  const title = getBlockTitle(block) ?? "Untitled";
  const breadcrumb = buildNotionBreadcrumb(recordMap, pageId);
  const subtitle = breadcrumb?.length ? breadcrumb.join(" / ") : undefined;
  const coverUrl = resolveNotionPageCoverUrl({ recordMap, pageId });
  const contentImageUrl = resolveFirstContentImageUrl({
    recordMap,
    pageId,
    signedUrls: recordMap.signed_urls,
  });
  const previewImageUrl = coverUrl ?? contentImageUrl;
  debugIngestionLog("preview-image-selected", {
    pageId,
    coverUrl,
    inlineImageUrl: contentImageUrl,
    finalPreview: previewImageUrl ?? null,
  });
  const teaserText = extractNotionTeaserText(recordMap, pageId, title);

  return {
    title,
    subtitle,
    source_kind: "notion",
    origin_id: pageId,
    breadcrumb,
    preview_image_url: previewImageUrl ?? null,
    teaser_text: teaserText,
  };
}
