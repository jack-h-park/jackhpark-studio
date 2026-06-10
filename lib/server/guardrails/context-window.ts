import { host } from "@/lib/config";
import { ragLogger } from "@/lib/logging/logger";
import { normalizePageId } from "@/lib/server/page-url";

import type {
  ChatGuardrailConfig,
  ChatIntent,
  ContextWindowResult,
  RagDocument,
  SelectionDedupMetrics,
  SelectionUnit,
} from "./types";
import { clipTextToTokens } from "./tokens";

const DEFAULT_MAX_CHUNKS_PER_DOC = 2;
const MAX_RELAXED_CHUNKS_PER_DOC = 6;
const DEDUP_NORMALIZE_MODE = "simple";
const DEDUP_MIN_CHARS = 80;
const DEDUP_FINGERPRINT_CHARS = 40;
const MMR_LITE_LAMBDA = 0.15;

const normalizeChunkText = (text: string): string => {
  if (DEDUP_NORMALIZE_MODE === "simple") {
    // eslint-disable-next-line unicorn/prefer-string-replace-all
    return text.replace(/\s+/g, " ").trim().toLowerCase();
  }
  return text.trim();
};

const fingerprintChunk = (text: string): string | null => {
  const normalized = normalizeChunkText(text);
  if (normalized.length < DEDUP_MIN_CHARS) {
    return null;
  }
  const head = normalized.slice(0, DEDUP_FINGERPRINT_CHARS);
  const tail = normalized.slice(-DEDUP_FINGERPRINT_CHARS);
  return `${normalized.length}:${head}:${tail}`;
};

const resolveDocId = (doc: RagDocument, index: number): string => {
  const meta = doc.metadata ?? {};
  return (
    (typeof meta.doc_id === "string" && meta.doc_id.trim()) ||
    (typeof doc.doc_id === "string" && doc.doc_id.trim()) ||
    (typeof meta.source_url === "string" && meta.source_url.trim()) ||
    (typeof doc.source_url === "string" && doc.source_url.trim()) ||
    (typeof meta.url === "string" && meta.url.trim()) ||
    `doc:${index}`
  );
};

export function dedupeSelectionDocuments(
  docs: RagDocument[],
  keyFn: (doc: RagDocument, index: number) => string | null,
  selectionUnit: SelectionUnit,
): SelectionDedupMetrics {
  const seen = new Set<string>();
  const uniqueKeys = new Set<string>();
  const deduped: RagDocument[] = [];

  for (const [index, doc] of docs.entries()) {
    const key = keyFn(doc, index);
    const uniqueKey = key ?? `__no-key:${selectionUnit}:${index}`;
    uniqueKeys.add(uniqueKey);
    if (!key) {
      deduped.push(doc);
      continue;
    }
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(doc);
    }
  }

  const uniqueAfterDedupe = deduped.length;
  return {
    selectionUnit,
    inputCount: docs.length,
    uniqueBeforeDedupe: uniqueKeys.size,
    uniqueAfterDedupe,
    droppedByDedupe: docs.length - uniqueAfterDedupe,
    dedupedDocs: deduped,
  };
}

export function buildContextWindow(
  documents: RagDocument[],
  config: ChatGuardrailConfig,
  options?: {
    includeVerboseDetails?: boolean;
    includeSelectionMetadata?: boolean;
  },
): ContextWindowResult {
  if (!documents || documents.length === 0) {
    return {
      contextBlock: "",
      included: [],
      dropped: 0,
      totalTokens: 0,
      insufficient: true,
      highestScore: 0,
    };
  }

  const normalizedDocs = documents
    .map((doc) => ({
      ...doc,
      chunk: doc.chunk ?? doc.content ?? doc.text ?? "",
    }))
    .filter(
      (doc) => typeof doc.chunk === "string" && doc.chunk.trim().length > 0,
    )
    // Node 18 does not include Array.prototype.toSorted yet.
    // eslint-disable-next-line unicorn/no-array-sort
    .sort((a, b) => getDocScore(b) - getDocScore(a));

  const chunkDedupe = dedupeSelectionDocuments(
    normalizedDocs,
    (doc) =>
      typeof doc.chunk === "string" ? fingerprintChunk(doc.chunk) : null,
    "chunk",
  );
  const docDedupe = dedupeSelectionDocuments(
    normalizedDocs,
    resolveDocId,
    "doc",
  );

  const rankedDocs = chunkDedupe.dedupedDocs;
  const finalK = config.ragTopK;
  const quotaStart = DEFAULT_MAX_CHUNKS_PER_DOC;
  let quotaEnd = quotaStart;
  let selectionMeta = {
    droppedByQuota: 0,
    uniqueDocs: 0,
  };
  let included: ContextWindowResult["included"] = [];
  let tokensUsed = 0;

  const selectWithQuota = (quota: number) => {
    const selected: ContextWindowResult["included"] = [];
    const selectedIndices = new Set<number>();
    const seenFingerprints = new Set<string>();
    const docCounts = new Map<string, number>();
    const countedDedupe = new Set<number>();
    const countedQuota = new Set<number>();
    let droppedByDedupe = 0;
    let droppedByQuota = 0;
    let localTokensUsed = 0;

    while (selected.length < finalK) {
      let bestIndex = -1;
      let bestDoc: RagDocument | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const [index, doc] of rankedDocs.entries()) {
        if (selectedIndices.has(index)) {
          continue;
        }
        const fingerprint = fingerprintChunk(doc.chunk!);
        if (fingerprint && seenFingerprints.has(fingerprint)) {
          if (!countedDedupe.has(index)) {
            countedDedupe.add(index);
            droppedByDedupe += 1;
          }
          continue;
        }
        const docId = resolveDocId(doc, index);
        const docCount = docCounts.get(docId) ?? 0;
        if (docCount >= quota) {
          if (!countedQuota.has(index)) {
            countedQuota.add(index);
            droppedByQuota += 1;
          }
          continue;
        }
        const similarityToSelected = docCount > 0 ? 1 : 0;
        const relevanceScore = getDocScore(doc);
        const effectiveScore =
          relevanceScore - MMR_LITE_LAMBDA * similarityToSelected;
        if (effectiveScore > bestScore) {
          bestScore = effectiveScore;
          bestIndex = index;
          bestDoc = doc;
        }
      }

      if (bestIndex < 0 || !bestDoc) {
        break;
      }

      const bestFingerprint = fingerprintChunk(bestDoc.chunk!);
      const bestDocId = resolveDocId(bestDoc, bestIndex);
      const clipped = clipTextToTokens(
        bestDoc.chunk!,
        config.ragContextClipTokens,
      );
      if (localTokensUsed + clipped.tokenCount > config.ragContextTokenBudget) {
        selectedIndices.add(bestIndex);
        continue;
      }
      if (bestFingerprint) {
        seenFingerprints.add(bestFingerprint);
      }
      docCounts.set(bestDocId, (docCounts.get(bestDocId) ?? 0) + 1);
      localTokensUsed += clipped.tokenCount;
      selectedIndices.add(bestIndex);
      selected.push({
        ...bestDoc,
        prunedChunk: clipped.text,
        clipped: clipped.clipped,
        tokenCount: clipped.tokenCount,
      });
    }

    return {
      selected,
      droppedByDedupe,
      droppedByQuota,
      uniqueDocs: docCounts.size,
      tokensUsed: localTokensUsed,
    };
  };

  for (
    let quota = quotaStart;
    quota <= MAX_RELAXED_CHUNKS_PER_DOC;
    quota += 1
  ) {
    const pass = selectWithQuota(quota);
    included = pass.selected;
    tokensUsed = pass.tokensUsed;
    quotaEnd = quota;
    selectionMeta = {
      droppedByQuota: pass.droppedByQuota,
      uniqueDocs: pass.uniqueDocs,
    };
    if (included.length >= finalK) {
      break;
    }
  }

  const contextBlock = included
    .map((doc, index) => {
      const metaLabel = buildDocumentLabel(doc);
      const headerParts = [`(${index + 1})`, metaLabel].filter(Boolean);
      const infoLine = headerParts.join(" ");
      return [infoLine, doc.prunedChunk.trim()].filter(Boolean).join("\n");
    })
    .join("\n\n---\n\n");

  const highestScoreDoc = chunkDedupe.dedupedDocs[0] ?? normalizedDocs[0];
  const highestScore = highestScoreDoc ? getDocScore(highestScoreDoc) : 0;
  const insufficient =
    highestScore < config.similarityThreshold || included.length === 0;

  return {
    contextBlock,
    included,
    dropped: chunkDedupe.dedupedDocs.length - included.length,
    totalTokens: tokensUsed,
    insufficient,
    highestScore,
    selection:
      options?.includeVerboseDetails || options?.includeSelectionMetadata
        ? {
            quotaStart,
            quotaEnd,
            quotaEndUsed: quotaEnd,
            droppedByDedupe: chunkDedupe.droppedByDedupe,
            droppedByQuota: selectionMeta.droppedByQuota,
            uniqueDocs: selectionMeta.uniqueDocs,
            selectionUnit: chunkDedupe.selectionUnit,
            inputCount: chunkDedupe.inputCount,
            uniqueBeforeDedupe: chunkDedupe.uniqueBeforeDedupe,
            uniqueAfterDedupe: chunkDedupe.uniqueAfterDedupe,
            finalSelectedCount: included.length,
            docSelection: {
              inputCount: docDedupe.inputCount,
              uniqueBeforeDedupe: docDedupe.uniqueBeforeDedupe,
              uniqueAfterDedupe: docDedupe.uniqueAfterDedupe,
              droppedByDedupe: docDedupe.droppedByDedupe,
            },
            mmrLite: true,
            mmrLambda: MMR_LITE_LAMBDA,
          }
        : undefined,
  };
}

export function buildIntentContextFallback(
  intent: ChatIntent,
  config: ChatGuardrailConfig,
): ContextWindowResult {
  switch (intent) {
    case "chitchat":
      return {
        contextBlock: config.fallbacks.chitchat,
        included: [],
        dropped: 0,
        totalTokens: 0,
        insufficient: true,
        highestScore: 0,
      };
    case "command":
      return {
        contextBlock: config.fallbacks.command,
        included: [],
        dropped: 0,
        totalTokens: 0,
        insufficient: true,
        highestScore: 0,
      };
    default:
      return {
        contextBlock: "",
        included: [],
        dropped: 0,
        totalTokens: 0,
        insufficient: true,
        highestScore: 0,
      };
  }
}

function getDocScore(doc: RagDocument | undefined): number {
  if (!doc) {
    return 0;
  }

  if (typeof doc.similarity === "number") {
    return doc.similarity;
  }
  if (typeof doc.score === "number") {
    return doc.score;
  }
  if (typeof doc.similarity_score === "number") {
    return doc.similarity_score;
  }
  return 0;
}

function buildDocumentLabel(doc: RagDocument): string {
  const title = getDocumentTitle(doc);
  const source = getPublicSourceUrl(doc);

  if (title && source) {
    return `${title} (${source})`;
  }

  return title ?? source ?? "";
}

function getPublicSourceUrl(doc: RagDocument): string | null {
  const rawSource = getDocumentSourceUrl(doc);
  if (!rawSource) {
    return null;
  }

  const normalizedSource = normalizeUrl(rawSource);

  let parsed: URL;
  try {
    parsed = new URL(normalizedSource);
  } catch {
    return normalizedSource;
  }

  const hostname = parsed.hostname.toLowerCase();
  const derivedDocId =
    normalizePageId(getDocumentId(doc)) ||
    normalizePageId(getLastPathSegment(parsed.pathname));

  if (
    derivedDocId &&
    (hostname.includes("notion.so") || hostname.includes("notion.site"))
  ) {
    const rewritten = `${host.replace(/\/+$/, "")}/${derivedDocId}`;
    ragLogger.trace("[chat-guardrails:url]", {
      source: rawSource,
      docId: derivedDocId,
      rewritten,
    });
    return rewritten;
  }

  ragLogger.trace("[chat-guardrails:url:passthrough]", {
    source: rawSource,
  });

  return normalizedSource;
}

function getDocumentTitle(doc: RagDocument): string | null {
  const candidates = [doc.title, doc.metadata?.title];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function getDocumentSourceUrl(doc: RagDocument): string | null {
  const candidates = [
    doc.source_url,
    doc.sourceUrl,
    doc.metadata?.source_url,
    doc.metadata?.sourceUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function getDocumentId(doc: RagDocument): string | null {
  const candidates = [
    doc.doc_id,
    doc.docId,
    doc.document_id,
    doc.documentId,
    doc.id,
    doc.metadata?.doc_id,
    doc.metadata?.docId,
    doc.metadata?.page_id,
    doc.metadata?.pageId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed && normalizePageId(trimmed)) {
        return trimmed;
      }
    }
  }

  return null;
}

function normalizeUrl(url: string): string {
  if (!url) {
    return url;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `https://${url.replace(/^\/+/, "")}`;
}

function getLastPathSegment(pathname: string): string | undefined {
  if (!pathname) {
    return undefined;
  }

  const segments = pathname.split("/").filter(Boolean);
  return segments.length > 0 ? segments.at(-1) : undefined;
}
