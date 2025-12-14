import type { EmbeddingSpace } from "@/lib/core/embedding-spaces";
import type { ModelProvider } from "@/lib/shared/model-provider";
import { embedTexts } from "@/lib/core/embeddings";
import { generateText } from "@/lib/server/text-generation";
import {
  DEFAULT_REVERSE_RAG_MODE,
  type RankerMode,
  type ReverseRagMode,
} from "@/lib/shared/rag-config";

const REVERSE_RAG_MAX_TOKENS = 64;
const REVERSE_RAG_TEMPERATURE = 0.2;
const HYDE_MAX_TOKENS = 220;
const HYDE_TEMPERATURE = 0.35;
const MMR_LAMBDA = 0.5;

export type ReverseRagOptions = {
  enabled: boolean;
  mode?: ReverseRagMode;
  provider: ModelProvider;
  model: string;
};

export async function rewriteQuery(
  originalQuery: string,
  options: ReverseRagOptions,
): Promise<string> {
  if (!options.enabled) {
    return originalQuery;
  }

  const mode = options.mode ?? DEFAULT_REVERSE_RAG_MODE;
  if (!originalQuery?.trim()) {
    return originalQuery;
  }

  const descriptors: Record<ReverseRagMode, string> = {
    precision:
      "Focus the search terms on the most specific and distinguishing concepts.",
    recall: "Include broader synonyms or related topics to cast a wider net.",
  };

  const systemPrompt =
    "You rewrite user questions into concise search queries optimized for a document search engine. Return only the rewritten query.";
  const userPrompt = [
    `Mode: ${mode} (${descriptors[mode]})`,
    "Question:",
    originalQuery,
  ].join("\n");

  try {
    const rewritten = await generateText({
      provider: options.provider,
      model: options.model,
      systemPrompt,
      userPrompt,
      temperature: REVERSE_RAG_TEMPERATURE,
      maxTokens: REVERSE_RAG_MAX_TOKENS,
    });
    return rewritten.length > 0 ? rewritten : originalQuery;
  } catch (err) {
    console.warn("[rag-enhancements] reverse query rewrite failed", err);
    return originalQuery;
  }
}

export type HydeOptions = {
  enabled: boolean;
  provider: ModelProvider;
  model: string;
};

export async function generateHydeDocument(
  query: string,
  options: HydeOptions,
): Promise<string | null> {
  if (!options.enabled || !query?.trim()) {
    return null;
  }

  const systemPrompt =
    "You are generating a hypothetical document that could plausibly answer the user question. Provide a short passage that contains potential statements or facts.";
  const userPrompt = ["Question:", query].join("\n");

  try {
    const hyde = await generateText({
      provider: options.provider,
      model: options.model,
      systemPrompt,
      userPrompt,
      temperature: HYDE_TEMPERATURE,
      maxTokens: HYDE_MAX_TOKENS,
    });
    return hyde.length > 0 ? hyde : null;
  } catch (err) {
    console.warn("[rag-enhancements] HyDE generation failed", err);
    return null;
  }
}

type RankerInputDoc = {
  chunk?: string | null;
  content?: string | null;
  text?: string | null;
  metadata?: Record<string, unknown> | null;
  similarity?: number | null;
};

export type RankerOptions = {
  mode: RankerMode;
  maxResults: number;
  embeddingSelection: EmbeddingSpace;
  queryEmbedding?: number[];
  mmrLambda?: number;
};

function getDocumentText(doc: RankerInputDoc): string | null {
  const candidate =
    doc.chunk?.trim() ?? doc.content?.trim() ?? doc.text?.trim() ?? null;
  return candidate && candidate.length > 0 ? candidate : null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [index, element] of a.entries()) {
    const valueA = element ?? 0;
    const valueB = b[index] ?? 0;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dot / magnitude : 0;
}

async function runMmr<T extends RankerInputDoc>(
  docs: T[],
  options: RankerOptions,
): Promise<T[]> {
  const { queryEmbedding, embeddingSelection, maxResults } = options;
  if (!queryEmbedding || docs.length === 0) {
    return docs.slice(0, maxResults);
  }

  const normalizedDocs: Array<{
    index: number;
    text: string;
  }> = docs
    .map((doc, index) => ({
      index,
      text: getDocumentText(doc),
    }))
    .filter((entry): entry is { index: number; text: string } =>
      Boolean(entry.text),
    );

  if (!normalizedDocs.length) {
    return docs.slice(0, maxResults);
  }

  const embeddings = await embedTexts(
    normalizedDocs.map((entry) => entry.text),
    {
      provider: embeddingSelection.provider,
      embeddingModelId: embeddingSelection.embeddingModelId,
      embeddingSpaceId: embeddingSelection.embeddingSpaceId,
      model: embeddingSelection.model,
    },
  );

  const mmrLambda = Math.max(0, Math.min(1, options.mmrLambda ?? MMR_LAMBDA));
  const selectedIndices: number[] = [];
  const finalDocs: T[] = [];

  while (finalDocs.length < Math.min(maxResults, docs.length)) {
    let bestScore = -Infinity;
    let bestIndex: number | null = null;

    for (const [candidateIndex] of normalizedDocs.entries()) {
      if (selectedIndices.includes(candidateIndex)) {
        continue;
      }

      const candidateEmbedding = embeddings[candidateIndex];
      if (!candidateEmbedding || candidateEmbedding.length === 0) {
        continue;
      }

      const similarityToQuery = cosineSimilarity(
        candidateEmbedding,
        queryEmbedding,
      );
      let diversityPenalty = 0;

      if (selectedIndices.length > 0) {
        diversityPenalty = Math.max(
          ...selectedIndices.map((selected) =>
            cosineSimilarity(candidateEmbedding, embeddings[selected] ?? []),
          ),
        );
      }

      const score =
        mmrLambda * similarityToQuery - (1 - mmrLambda) * diversityPenalty;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = candidateIndex;
      }
    }

    if (bestIndex === null) {
      break;
    }

    selectedIndices.push(bestIndex);
    const selectedDocIndex = normalizedDocs[bestIndex].index;
    finalDocs.push(docs[selectedDocIndex]);
  }

  return finalDocs;
}

export async function applyRanker<T extends RankerInputDoc>(
  docs: T[],
  options: RankerOptions,
): Promise<T[]> {
  if (docs.length === 0) {
    return [];
  }

  const trimmedMax = Math.max(1, Math.floor(options.maxResults));

  switch (options.mode) {
    case "mmr":
      try {
        return await runMmr(docs, { ...options, maxResults: trimmedMax });
      } catch (err) {
        console.warn("[rag-enhancements] MMR ranking failed", err);
        return docs.slice(0, trimmedMax);
      }
    case "cohere-rerank":
      console.warn(
        "[rag-enhancements] cohere-rerank reranker requested but not implemented. Falling back to vector order.",
      );
      return docs.slice(0, trimmedMax);
    default:
      return docs.slice(0, trimmedMax);
  }
}
