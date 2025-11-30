import { type Decoration, type ExtendedRecordMap } from "notion-types";
import { getTextContent } from "notion-utils";

import {
  DOC_TYPE_OPTIONS,
  PERSONA_TYPE_OPTIONS,
  normalizeMetadata,
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
