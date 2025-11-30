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

export type RagDocumentMetadata = {
  source_type?: SourceType;
  doc_type?: DocType;
  persona_type?: PersonaType;
  is_public?: boolean;
  tags?: string[];
  [key: string]: unknown;
};

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
          typeof tag === "string" ? tag.trim() : typeof tag === "number" ? String(tag) : "",
        )
        .filter(Boolean),
    ),
  );
  const sorted = normalized.toSorted((a, b) => a.localeCompare(b));

  return sorted;
}

function sortEntries(
  entries: [string, unknown][],
): [string, unknown][] {
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
