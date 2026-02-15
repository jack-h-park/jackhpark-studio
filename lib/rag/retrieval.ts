import type { SupabaseClient } from "@supabase/supabase-js";

export type RagRetrievalMode = "native" | "langchain";
export type RagEmbeddingProvider = "openai" | "gemini";
export type RagFilter = Record<string, unknown>;

const MATCH_RPC_VERSION = process.env.RAG_MATCH_RPC_VERSION === "2" ? "2" : "1";

function getMatchFunctionName(
  mode: RagRetrievalMode,
  provider: RagEmbeddingProvider,
): string {
  const suffix = provider === "gemini" ? "gemini_te4" : "openai_te3s";
  const prefix =
    mode === "native" ? "match_native_chunks" : "match_langchain_chunks";
  return `${prefix}_${suffix}_v${MATCH_RPC_VERSION}`;
}

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

  const rpcName = getMatchFunctionName(mode, embeddingProvider);

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

  const rows = Array.isArray(data) ? data : [];
  const lowResultThreshold = Math.max(1, Math.floor(matchCount / 2));
  if (rows.length === 0 || rows.length < lowResultThreshold) {
    console.warn("[rag:retrieval] low result count", {
      rpcName,
      mode,
      embeddingProvider,
      matchCount,
      returned: rows.length,
      statusPolicy: "active-only",
    });
  }

  return rows;
}
