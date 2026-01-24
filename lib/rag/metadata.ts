export type DocType =
  | "profile"
  | "blog_post"
  | "kb_article"
  | "insight_note"
  | "project_article"
  | "photo"
  | "other";

export type PersonaType = "personal" | "professional" | "hybrid";

export type SourceType = "notion" | "url" | string;

export interface RagDocumentMetadata {
  title?: string;
  subtitle?: string;
  source_kind?: "notion" | "url" | "file" | "github" | string;
  origin_id?: string;
  breadcrumb?: string[];
  preview_image_url?: string | null;
  teaser_text?: string;
  doc_id?: string;
  raw_doc_id?: string;

  source_type?: SourceType;
  doc_type?: DocType;
  persona_type?: PersonaType;
  'public'?: boolean;
  is_public?: boolean;
  tags?: string[];
  [key: string]: unknown;
}

export const DOC_TYPE_OPTIONS: readonly DocType[] = [
  "profile",
  "blog_post",
  "kb_article",
  "insight_note",
  "project_article",
  "photo",
  "other",
] as const;

export const PERSONA_TYPE_OPTIONS: readonly PersonaType[] = [
  "personal",
  "professional",
  "hybrid",
] as const;

const DOC_TYPE_SET = new Set(DOC_TYPE_OPTIONS);
const PERSONA_TYPE_SET = new Set(PERSONA_TYPE_OPTIONS);

export function parseDocType(value?: string | null): DocType | undefined {
  if (!value) {
    return undefined;
  }
  const candidate = value.trim().toLowerCase();
  return DOC_TYPE_SET.has(candidate as DocType)
    ? (candidate as DocType)
    : undefined;
}

export function parsePersonaType(
  value?: string | null,
): PersonaType | undefined {
  if (!value) {
    return undefined;
  }
  const candidate = value.trim().toLowerCase();
  return PERSONA_TYPE_SET.has(candidate as PersonaType)
    ? (candidate as PersonaType)
    : undefined;
}

export const SOURCE_TYPE_OPTIONS: readonly SourceType[] = [
  "notion",
  "url",
] as const;

type NormalizedMetadata = RagDocumentMetadata | null;

function normalizeTags(tags: unknown): string[] | undefined {
  if (!Array.isArray(tags)) {
    return undefined;
  }

  const normalized = Array.from(
    new Set(
      tags
        .map((tag) =>
          typeof tag === "string"
            ? tag.trim()
            : typeof tag === "number"
              ? String(tag)
              : "",
        )
        .filter(Boolean),
    ),
  );
  const sorted = normalized.toSorted((a, b) => a.localeCompare(b));

  return sorted;
}

function sortEntries(entries: [string, unknown][]): [string, unknown][] {
  return entries.toSorted(([a], [b]) => a.localeCompare(b));
}

/**
 * Normalize metadata by removing undefined fields, sorting keys, and cleaning tags.
 */
export function normalizeMetadata(
  metadata: RagDocumentMetadata | null | undefined,
): NormalizedMetadata {
  if (!metadata) {
    return null;
  }

  const entries: [string, unknown][] = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) {
      continue;
    }

    if (key === "tags") {
      const normalizedTags = normalizeTags(value);
      if (normalizedTags) {
        entries.push([key, normalizedTags]);
      }
      continue;
    }

    entries.push([key, value]);
  }

  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(sortEntries(entries)) as RagDocumentMetadata;
}

export function applyDefaultDocMetadata(
  metadata: RagDocumentMetadata | null | undefined,
  defaults?: {
    doc_type?: DocType | null;
    persona_type?: PersonaType | null;
  },
): RagDocumentMetadata | null {
  const normalized = normalizeMetadata(metadata ?? null);
  const docType = defaults?.doc_type ?? null;
  const personaType = defaults?.persona_type ?? null;
  if (!normalized && !docType && !personaType) {
    return null;
  }
  const enriched: RagDocumentMetadata = {
    ...normalized,
  };
  if (!enriched.doc_type && docType) {
    enriched.doc_type = docType;
  }
  if (!enriched.persona_type && personaType) {
    enriched.persona_type = personaType;
  }
  return normalizeMetadata(enriched);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const sortedEntries = sortEntries(
      Object.entries(value).filter(([, v]) => v !== undefined),
    );
    const serialized = sortedEntries
      .map(([key, v]) => `${key}:${stableSerialize(v)}`)
      .join(",");
    return `{${serialized}}`;
  }

  return JSON.stringify(value);
}

export function metadataEquals(
  a: RagDocumentMetadata | null | undefined,
  b: RagDocumentMetadata | null | undefined,
): boolean {
  const normalizedA = normalizeMetadata(a);
  const normalizedB = normalizeMetadata(b);

  if (!normalizedA && !normalizedB) {
    return true;
  }

  if (!normalizedA || !normalizedB) {
    return false;
  }

  return stableSerialize(normalizedA) === stableSerialize(normalizedB);
}

export function mergeMetadata(
  existing: RagDocumentMetadata | null | undefined,
  incoming: RagDocumentMetadata | null | undefined,
): RagDocumentMetadata | null {
  const normalizedExisting = normalizeMetadata(existing) ?? undefined;
  const normalizedIncoming = normalizeMetadata(incoming) ?? undefined;

  const merged = {
    ...normalizedExisting,
    ...normalizedIncoming,
  };

  return normalizeMetadata(merged);
}

export function parseRagDocumentMetadata(value: unknown): RagDocumentMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as RagDocumentMetadata;
}

export function mergeRagDocumentMetadata(
  existing: RagDocumentMetadata | null | undefined,
  incoming: RagDocumentMetadata,
): RagDocumentMetadata {
  const base = normalizeMetadata(existing) ?? {};
  const incomingNormalized = normalizeMetadata(incoming) ?? {};

  const merged: RagDocumentMetadata = {
    ...base,
    title: incomingNormalized.title ?? base.title,
    subtitle: incomingNormalized.subtitle ?? base.subtitle,
    source_kind: incomingNormalized.source_kind ?? base.source_kind,
    origin_id: incomingNormalized.origin_id ?? base.origin_id,
    breadcrumb: incomingNormalized.breadcrumb ?? base.breadcrumb,
    preview_image_url:
      incomingNormalized.preview_image_url ?? base.preview_image_url,
    teaser_text: incomingNormalized.teaser_text ?? base.teaser_text,
    doc_type: incomingNormalized.doc_type ?? base.doc_type ?? undefined,
    persona_type:
      incomingNormalized.persona_type ?? base.persona_type ?? undefined,
    is_public: incomingNormalized.is_public ?? base.is_public ?? undefined,
    tags: incomingNormalized.tags ?? base.tags ?? undefined,
  };

  return normalizeMetadata(merged) ?? {};
}

export function stripDocIdentifierFields(
  metadata: RagDocumentMetadata | null | undefined,
): RagDocumentMetadata | null {
  if (!metadata) {
    return null;
  }

  const { doc_id: _doc_id, raw_doc_id: _raw_doc_id, ...rest } = metadata;
  if (Object.keys(rest).length === 0) {
    return null;
  }

  return normalizeMetadata(rest);
}

const rawDefaultDocType = process.env.RAG_DEFAULT_DOC_TYPE;
const rawDefaultPersonaType = process.env.RAG_DEFAULT_PERSONA_TYPE;

const FALLBACK_DOC_TYPE: DocType | null =
  rawDefaultDocType === ""
    ? null
    : (parseDocType(rawDefaultDocType ?? "kb_article") ?? "kb_article");
const FALLBACK_PERSONA_TYPE: PersonaType | null =
  rawDefaultPersonaType === ""
    ? null
    : (parsePersonaType(rawDefaultPersonaType ?? "professional") ??
      "professional");

export const DEFAULT_INGEST_DOC_TYPE: DocType | null = FALLBACK_DOC_TYPE;
export const DEFAULT_INGEST_PERSONA_TYPE: PersonaType | null =
  FALLBACK_PERSONA_TYPE;
