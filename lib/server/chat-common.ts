import type { langfuse } from "@/lib/langfuse";
import type { ChatConfigSnapshot } from "@/lib/rag/types";
import { isDomainLogLevelEnabled, ragLogger } from "@/lib/logging/logger";

// ... types ...

export const CITATIONS_SEPARATOR = `\n\n--- begin citations ---\n`;
export const DEFAULT_TEMPERATURE = Number(process.env.LLM_TEMPERATURE ?? 0);

export type Citation = {
  doc_id?: string | null;
  title?: string | null;
  source_url?: string | null;
  excerpt_count: number;
  doc_type?: string | null;
  persona_type?: string | null;
  weight?: number | null;
  rankIndex?: number;
};

export type ChatRequestBody = {
  question?: unknown;
  messages?: unknown;
  provider?: unknown;
  embeddingProvider?: unknown;
  model?: unknown;
  embeddingModel?: unknown;
  embeddingSpaceId?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
  reverseRagEnabled?: unknown;
  reverseRagMode?: unknown;
  hydeEnabled?: unknown;
  rankerMode?: unknown;
  sessionConfig?: unknown;
  config?: unknown;
};

export type RetrievalLogEntry = {
  doc_id: string | null;
  similarity: number | null;
  weight?: number | null;
  finalScore?: number | null;
  doc_type?: string | null;
  persona_type?: string | null;
  is_public?: boolean | null;
};

export function parseTemperature(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return DEFAULT_TEMPERATURE;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_TEMPERATURE;
}

export function logRetrievalStage(
  trace: ReturnType<typeof langfuse.trace> | null,
  stage: string,
  entries: RetrievalLogEntry[],
  meta?: {
    engine?: string;
    presetKey?: string;
    chatConfig?: ChatConfigSnapshot;
  },
) {
  if (!trace && !isDomainLogLevelEnabled("rag", "trace")) {
    return;
  }

  const payload = entries.map((entry) => ({
    doc_id: entry.doc_id,
    similarity: entry.similarity,
    weight: entry.weight,
    finalScore: entry.finalScore,
    doc_type: entry.doc_type ?? null,
    persona_type: entry.persona_type ?? null,
    is_public: entry.is_public ?? null,
  }));

  ragLogger.trace(
    `[rag:${meta?.engine ?? "unknown"}] retrieval ${stage}`,
    payload,
  );

  void trace?.observation({
    name: "rag_retrieval_stage",
    metadata: {
      stage,
      engine: meta?.engine ?? "unknown",
      presetKey: meta?.presetKey ?? meta?.chatConfig?.presetKey ?? "default",
      chatConfig: meta?.chatConfig,
      ragConfig: meta?.chatConfig,
      entries: payload,
    },
  });
}

export const MAX_RETRIEVAL_TELEMETRY_ITEMS = 8;

type RawRetrievalDocument = {
  docId?: string | null;
  doc_id?: string | null;
  documentId?: string | null;
  document_id?: string | null;
  similarity?: number | null;
  baseSimilarity?: number | null;
  metadata_weight?: number | null;
  metadata?: {
    doc_type?: string | null;
    docType?: string | null;
    persona_type?: string | null;
    personaType?: string | null;
    is_public?: boolean | null;
    weight?: number | null;
  } | null;
  [key: string]: unknown;
};

export function buildRetrievalTelemetryEntries<T extends RawRetrievalDocument>(
  documents: T[],
  limit = MAX_RETRIEVAL_TELEMETRY_ITEMS,
): RetrievalLogEntry[] {
  const safeLimit = Math.max(0, limit);
  return documents.slice(0, safeLimit).map((doc) => {
    const docId =
      doc.docId ?? doc.doc_id ?? doc.documentId ?? doc.document_id ?? null;
    const similarity =
      typeof doc.baseSimilarity === "number"
        ? doc.baseSimilarity
        : typeof doc.similarity === "number"
          ? doc.similarity
          : null;
    return {
      doc_id: docId,
      similarity,
      weight:
        typeof doc.metadata_weight === "number"
          ? doc.metadata_weight
          : (doc.metadata?.weight ?? null),
      finalScore:
        typeof doc.similarity === "number"
          ? doc.similarity
          : typeof doc.baseSimilarity === "number"
            ? doc.baseSimilarity
            : null,
      doc_type: doc.metadata?.doc_type ?? doc.metadata?.docType ?? null,
      persona_type:
        doc.metadata?.persona_type ?? doc.metadata?.personaType ?? null,
      is_public: doc.metadata?.is_public ?? null,
    };
  });
}
