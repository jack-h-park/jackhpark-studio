import type { langfuse } from "@/lib/langfuse";
import type { ChatConfigSnapshot } from "@/lib/rag/types";

// ... types ...

export const CITATIONS_SEPARATOR = `\n\n--- begin citations ---\n`;
export const DEFAULT_TEMPERATURE = Number(process.env.LLM_TEMPERATURE ?? 0);

export const DEBUG_LANGCHAIN_STREAM =
  (process.env.DEBUG_LANGCHAIN_STREAM ?? "").toLowerCase() === "true";
export const DEBUG_RAG_STEPS =
  (process.env.DEBUG_RAG_STEPS ?? "").toLowerCase() === "true";
export const DEBUG_RAG_URLS =
  (process.env.DEBUG_RAG_URLS ?? "").toLowerCase() === "true";
export const DEBUG_RAG_MSGS =
  (process.env.DEBUG_RAG_MSGS ?? "").toLowerCase() === "true";

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
  // Force-exclude detailed logs if DEBUG_RAG_STEPS is false, even if trace is active.
  if (!DEBUG_RAG_STEPS && !trace) {
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

  if (DEBUG_RAG_STEPS) {
    console.log(`[rag:${meta?.engine ?? "unknown"}] retrieval`, stage, payload);
  }

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
