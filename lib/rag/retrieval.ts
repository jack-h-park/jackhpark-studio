import type { SupabaseClient } from "@supabase/supabase-js";

import { getLcMatchFunction, getRagMatchFunction } from "@/lib/core/rag-tables";

export type RagRetrievalMode = "native" | "langchain";
export type RagEmbeddingProvider = "openai" | "gemini";
export type RagFilter = Record<string, unknown>;

/**
 * NOTE: nothing imports this module today — chat retrieves through
 * `lib/server/langchain/rag-retrieval-chain.ts`.
 *
 * It shared the version resolver but still hardcoded its own provider→suffix mapping, so the
 * two name derivations could still drift on everything except the version. Both now come
 * from `lib/core/rag-tables`, which is also where the environment is read.
 */
function getMatchFunctionName(
  mode: RagRetrievalMode,
  provider: RagEmbeddingProvider,
): string {
  return mode === "native"
    ? getRagMatchFunction(provider)
    : getLcMatchFunction(provider);
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
    similarityThreshold = 0.4,
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
