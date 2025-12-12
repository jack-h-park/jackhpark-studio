import type { RagDocument } from "@/lib/server/chat-guardrails";
import type { RagRankingConfig } from "@/types/chat-config";
import { computeMetadataWeight } from "@/lib/rag/ranking";

export type CitationChunkDetail = {
  chunkIndex: number;
  snippet: string;
  similarity: number;
  weight: number;
  finalScore: number;
};

export type CitationDocScore = {
  docId: string | null;
  title?: string | null;
  url?: string | null;
  docType?: string | null;
  personaType?: string | null;

  similarityMax: number;
  similarityAvg: number;
  weight: number;
  finalScore: number;
  normalizedScore: number;
  excerptCount: number;
  chunkIndices: number[];
  chunks: CitationChunkDetail[];
};

export type CitationMeta = {
  topKChunks: number;
  uniqueDocs: number;
  message: string;
};

export type CitationPayload = {
  citations: CitationDocScore[];
  citationMeta: CitationMeta;
};

const MAX_SNIPPET_LENGTH = 240;

function buildSnippet(doc: RagDocument): string {
  const rawSnippet =
    (doc.prunedChunk ?? doc.chunk ?? doc.content ?? "").trim() ?? "";
  const condensed = rawSnippet.replaceAll(/\s+/g, " ").trim();
  if (condensed.length <= MAX_SNIPPET_LENGTH) {
    return condensed;
  }
  return `${condensed.slice(0, MAX_SNIPPET_LENGTH)}…`;
}

function pickDocId(doc: RagDocument): string | null {
  return (
    (doc?.metadata?.doc_id as string | undefined) ??
    (doc?.metadata?.docId as string | undefined) ??
    (doc?.metadata?.page_id as string | undefined) ??
    (doc?.metadata?.pageId as string | undefined) ??
    (doc?.metadata?.document_id as string | undefined) ??
    (doc?.metadata?.documentId as string | undefined) ??
    null
  );
}

function pickSourceUrl(doc: RagDocument): string | null {
  const raw =
    (doc?.metadata?.source_url as string | undefined) ??
    (doc?.metadata?.sourceUrl as string | undefined) ??
    null;
  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

function pickTitle(doc: RagDocument): string | null {
  const raw =
    (doc?.metadata?.title as string | undefined) ??
    (doc?.metadata?.document_meta?.title as string | undefined);
  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

function pickDocType(doc: RagDocument): string | null {
  const raw = (doc?.metadata as { doc_type?: string | null } | null)?.doc_type;
  return raw ?? null;
}

function pickPersonaType(doc: RagDocument): string | null {
  const raw = (
    doc?.metadata as { persona_type?: string | null } | null
  )?.persona_type;
  return raw ?? null;
}

function computeDocWeight(
  doc: RagDocument,
  ragRanking?: RagRankingConfig | null,
): number {
  const explicitWeight = (doc as { metadata_weight?: number }).metadata_weight;
  if (typeof explicitWeight === "number" && Number.isFinite(explicitWeight)) {
    return explicitWeight;
  }
  return computeMetadataWeight(doc?.metadata ?? null, ragRanking);
}

function buildDocumentKey(
  docId: string | null,
  url: string | null,
  fallbackIndex: number,
): string {
  if (docId) {
    return docId;
  }
  if (url) {
    return url.toLowerCase();
  }
  return `idx:${fallbackIndex}`;
}

export function buildCitationPayload(
  documents: RagDocument[],
  options?: {
    topKChunks?: number;
    ragRanking?: RagRankingConfig | null;
  },
): CitationPayload {
  const topKChunks = Math.max(0, options?.topKChunks ?? documents.length);
  type AggregatedDoc = {
    docId: string | null;
    title?: string | null;
    url?: string | null;
    docType?: string | null;
    personaType?: string | null;
    weight: number;
    similaritySum: number;
    similarityMax: number;
    excerptCount: number;
    chunkIndices: number[];
    chunkDetails: CitationChunkDetail[];
  };

  const docMap = new Map<string, AggregatedDoc>();
  for (const [chunkIndex, doc] of documents.entries()) {
    const similarity =
      typeof doc.similarity === "number" && Number.isFinite(doc.similarity)
        ? doc.similarity
        : 0;
    const weight = computeDocWeight(doc, options?.ragRanking);
    const key = buildDocumentKey(
      pickDocId(doc),
      pickSourceUrl(doc),
      chunkIndex,
    );

    const existing = docMap.get(key);
    if (existing) {
      existing.similaritySum += similarity;
      existing.similarityMax = Math.max(existing.similarityMax, similarity);
      existing.excerptCount += 1;
      existing.chunkIndices.push(chunkIndex);
      existing.chunkDetails.push({
        chunkIndex,
        snippet: buildSnippet(doc),
        similarity,
        weight,
        finalScore: similarity * weight,
      });
    } else {
      const docId = pickDocId(doc);
      const url = pickSourceUrl(doc);
      docMap.set(key, {
        docId,
        title: pickTitle(doc) ?? null,
        url,
        docType: pickDocType(doc),
        personaType: pickPersonaType(doc),
        weight,
        similaritySum: similarity,
        similarityMax: similarity,
        excerptCount: 1,
        chunkIndices: [chunkIndex],
        chunkDetails: [
          {
            chunkIndex,
            snippet: buildSnippet(doc),
            similarity,
            weight,
            finalScore: similarity * weight,
          },
        ],
      });
    }
  }

  const docs = Array.from(docMap.values());
  const highestFinalScore = docs.reduce((max, doc) => {
    const finalScore = doc.similarityMax * doc.weight;
    return Math.max(max, finalScore);
  }, 0);

  const citations: CitationDocScore[] = docs
    .map((doc) => {
      const finalScore = doc.similarityMax * doc.weight;
      const normalizedScore =
        highestFinalScore > 0
          ? Math.round((finalScore / highestFinalScore) * 100)
          : 0;
      const similarityAvg =
        doc.excerptCount > 0 ? doc.similaritySum / doc.excerptCount : 0;

      return {
        docId: doc.docId,
        title: doc.title ?? undefined,
        url: doc.url ?? undefined,
        docType: doc.docType ?? undefined,
        personaType: doc.personaType ?? undefined,
        similarityMax: doc.similarityMax,
        similarityAvg,
        weight: doc.weight,
        finalScore,
        normalizedScore,
        excerptCount: doc.excerptCount,
        chunkIndices: doc.chunkIndices,
        chunks: doc.chunkDetails,
      };
    })
    .toSorted((a, b) => {
      if (b.finalScore !== a.finalScore) {
        return b.finalScore - a.finalScore;
      }
      return (b.similarityMax ?? 0) - (a.similarityMax ?? 0);
    });

  const uniqueDocs = citations.length;
  const message =
    uniqueDocs === 0
      ? "No citations were generated."
      : topKChunks === uniqueDocs
        ? `Top ${topKChunks} chunks were retrieved.`
        : `Top ${topKChunks} chunks → grouped into ${uniqueDocs} documents.`;

  const citationMeta: CitationMeta = {
    topKChunks,
    uniqueDocs,
    message,
  };

  return {
    citations,
    citationMeta,
  };
}
