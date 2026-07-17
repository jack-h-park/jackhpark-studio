import type { RagDocumentMetadata } from "@/lib/rag/metadata";

/** Prefix stamped on image-caption chunk text at ingest (lib/rag/image-captions.ts). */
export const IMAGE_CHUNK_PREFIX = "[Image]";

const DEFAULT_VISUAL_KEYWORDS = [
  // English
  "visually",
  "visual",
  "image",
  "picture",
  "photo",
  "diagram",
  "screenshot",
  "chart",
  "graph",
  "figure",
  // Korean
  "그림",
  "이미지",
  "사진",
  "다이어그램",
  "스크린샷",
  "차트",
  "그래프",
  "시각적",
];

function visualKeywords(): string[] {
  const raw = process.env.VISUAL_INTENT_KEYWORDS;
  if (!raw) {
    return DEFAULT_VISUAL_KEYWORDS;
  }
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/** Keyword heuristic, same spirit as the chitchat-keyword router. */
export function hasVisualIntent(question: string | null | undefined): boolean {
  if (!question) {
    return false;
  }
  const normalized = question.toLowerCase();
  return visualKeywords().some((keyword) => normalized.includes(keyword));
}

type ImageChunkLookup = Record<string, { image_url?: string }> | undefined;

/**
 * A chunk is an image chunk when its hash appears in the doc's image_chunks
 * map (authoritative) or its text carries the ingest-time prefix (fallback
 * for paths where doc-level metadata has not been merged yet).
 */
export function isImageChunk(
  chunkText: string | null | undefined,
  metadata: RagDocumentMetadata | null | undefined,
): boolean {
  const chunkHash = metadata?.chunk_hash;
  if (typeof chunkHash === "string") {
    const lookup = metadata?.image_chunks as ImageChunkLookup;
    if (lookup?.[chunkHash]) {
      return true;
    }
  }
  return Boolean(chunkText?.startsWith(IMAGE_CHUNK_PREFIX));
}

/** Weight multiplier applied to image chunks on visual-intent queries. */
export function imageChunkVisualBoost(): number {
  const parsed = Number(process.env.IMAGE_CHUNK_VISUAL_BOOST ?? 1.3);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1.3;
  }
  return parsed;
}

/** Resolve the exact image for a chunk from the doc's image_chunks map. */
export function imageUrlForChunk(
  metadata: RagDocumentMetadata | null | undefined,
): string | null {
  const chunkHash = metadata?.chunk_hash;
  if (typeof chunkHash !== "string") {
    return null;
  }
  const lookup = metadata?.image_chunks as ImageChunkLookup;
  const url = lookup?.[chunkHash]?.image_url;
  return typeof url === "string" && url.length > 0 ? url : null;
}
