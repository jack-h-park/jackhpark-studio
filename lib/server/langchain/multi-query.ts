import type {
  BaseRetrievalItem,
  EnrichedRetrievalItem,
} from "@/lib/server/chat-rag-utils";
import { hashPayload } from "@/lib/server/chat-cache";

export type MultiQueryAltType = "rewrite" | "hyde" | "none";

type CandidateDoc = EnrichedRetrievalItem<BaseRetrievalItem> & {
  chunk?: string | null;
  content?: string | null;
  text?: string | null;
  similarity_score?: number | null;
  score?: number | null;
};

const getCandidateText = (candidate: CandidateDoc): string => {
  const raw = candidate.chunk ?? candidate.content ?? candidate.text ?? "";
  return typeof raw === "string" ? raw : "";
};

const getCandidateScore = (candidate: CandidateDoc): number => {
  if (typeof candidate.similarity === "number") {
    return candidate.similarity;
  }
  if (typeof candidate.baseSimilarity === "number") {
    return candidate.baseSimilarity;
  }
  if (typeof candidate.score === "number") {
    return candidate.score;
  }
  if (typeof candidate.similarity_score === "number") {
    return candidate.similarity_score;
  }
  return 0;
};

const getCandidateKey = (candidate: CandidateDoc) => {
  const meta = (candidate.metadata ?? {}) as Record<string, unknown>;

  const docId =
    (candidate.docId as string | null | undefined) ??
    (meta.doc_id as string | null | undefined) ??
    null;

  const sourceUrl = (meta.source_url as string | null | undefined) ?? null;

  // Prefer stable chunk/content identifiers when available.
  const chunkId =
    (meta.chunk_id as string | null | undefined) ??
    (meta.chunkId as string | null | undefined) ??
    null;

  const contentHash =
    (meta.content_hash as string | null | undefined) ??
    (meta.contentHash as string | null | undefined) ??
    null;

  const chunkIndex =
    (meta.chunk_index as number | null | undefined) ??
    (meta.chunkIndex as number | null | undefined) ??
    null;

  if (chunkId) {
    return `doc:${docId ?? "unknown"}:src:${sourceUrl ?? "unknown"}:chunk:${chunkId}`;
  }

  if (contentHash) {
    return `doc:${docId ?? "unknown"}:src:${sourceUrl ?? "unknown"}:hash:${contentHash}`;
  }

  if (typeof chunkIndex === "number") {
    return `doc:${docId ?? "unknown"}:src:${sourceUrl ?? "unknown"}:idx:${chunkIndex}`;
  }

  // Last-resort fallback: hash a truncated view of the text to reduce CPU cost.
  const text = getCandidateText(candidate);
  const normalized = text.trim();
  const head = normalized.slice(0, 512);
  const tail = normalized.length > 512 ? normalized.slice(-512) : "";
  const textHash = hashPayload({
    docId,
    sourceUrl,
    head,
    tail,
    len: normalized.length,
  });

  return `doc:${docId ?? "unknown"}:src:${sourceUrl ?? "unknown"}:text:${textHash}`;
};

export function pickAltQueryType(options: {
  firedRewrite: boolean;
  firedHyde: boolean;
  rewriteQuery?: string | null;
  hydeQuery?: string | null;
}): MultiQueryAltType {
  if (options.firedRewrite && options.rewriteQuery?.trim()) {
    return "rewrite";
  }
  if (options.firedHyde && options.hydeQuery?.trim()) {
    return "hyde";
  }
  return "none";
}

export function mergeCandidates(
  base: CandidateDoc[],
  alt: CandidateDoc[],
): CandidateDoc[] {
  type Entry = {
    candidate: CandidateDoc;
    score: number;
    order: number;
  };
  const merged = new Map<string, Entry>();
  const addCandidate = (candidate: CandidateDoc, order: number) => {
    const key = getCandidateKey(candidate);
    const score = getCandidateScore(candidate);
    const existing = merged.get(key);
    if (!existing || score > existing.score) {
      merged.set(key, { candidate, score, order });
    }
  };

  for (const [index, candidate] of base.entries())
    addCandidate(candidate, index);
  for (const [index, candidate] of alt.entries()) {
    addCandidate(candidate, base.length + index);
  }

  const entries = Array.from(merged.values());
  entries.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.order - b.order;
  });
  return entries.map((entry) => entry.candidate);
}
