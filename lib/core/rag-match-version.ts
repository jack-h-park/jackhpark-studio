/**
 * Retrieval RPC version, resolved independently of the embedding space.
 *
 * The embedding space id already ends in a version segment (`openai_te3s_v1`)
 * that tracks the embedding *model*, not the RPC. Deriving the RPC suffix from
 * it made the two versions inseparable, so the v2 RPCs were unreachable without
 * also repointing the chunk table and view. This axis is separate on purpose.
 */
export type RagMatchRpcVersion = "1" | "2";

export const DEFAULT_RAG_MATCH_RPC_VERSION: RagMatchRpcVersion = "1";

export function resolveRagMatchRpcVersion(
  raw: string | undefined = process.env.RAG_MATCH_RPC_VERSION,
): RagMatchRpcVersion {
  return raw?.trim() === "2" ? "2" : DEFAULT_RAG_MATCH_RPC_VERSION;
}
