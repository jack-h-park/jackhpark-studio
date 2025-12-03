import type { SupabaseClient } from "@supabase/supabase-js";

export type RagRetrievalMode = "native" | "langchain";
export type RagEmbeddingProvider = "openai" | "gemini";
export type RagFilter = Record<string, unknown>;

export interface RagRetrievalOptions {
  client: SupabaseClient;
  embedding: number[];
  matchCount: number;
  similarityThreshold?: number;
  filter?: RagFilter | null;
  mode: RagRetrievalMode;
  embeddingProvider: RagEmbeddingProvider;
}

export async function matchRagChunksForConfig(
  options: RagRetrievalOptions,
): Promise<unknown[]> {
  const {
    client,
    embedding,
    matchCount,
    similarityThreshold = 0.78,
    filter = {},
    mode,
    embeddingProvider,
  } = options;

  const rpcName = (() => {
    if (mode === "native") {
      return embeddingProvider === "gemini"
        ? "match_rag_chunks_native_gemini"
        : "match_rag_chunks_native_openai";
    }

    return embeddingProvider === "gemini"
      ? "match_rag_chunks_langchain_gemini"
      : "match_rag_chunks_langchain_openai";
  })();

  const payload =
    mode === "native"
      ? {
          query_embedding: embedding,
          match_count: matchCount,
          similarity_threshold: similarityThreshold,
          filter: filter ?? {},
        }
      : {
          query_embedding: embedding,
          match_count: matchCount,
          filter: filter ?? {},
        };

  const { data, error } = await client.rpc(rpcName, payload);
  if (error) {
    throw new Error(
      `Error matching RAG chunks via ${rpcName}: ${error.message}`,
    );
  }

  return Array.isArray(data) ? data : [];
}
