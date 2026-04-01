/**
 * Cache key builders for chat response and retrieval caching.
 *
 * Pure functions with no side effects. All key-space changes must be reflected
 * in both the response cache key and the retrieval cache key to avoid stale hits.
 */

import type { ChatMessage } from "@/lib/server/chat-messages";
import type { MultiQueryAltType } from "@/lib/server/langchain/multi-query";
import type { RankerMode, ReverseRagMode } from "@/lib/shared/rag-config";
import type { RagAutoMode, RagMultiQueryMode } from "@/types/chat-config";
import { hashPayload } from "@/lib/server/chat-cache";
import { stableHash } from "@/lib/server/telemetry/stable-hash";

/**
 * The Auto-RAG decision result that is embedded in the response cache key.
 * Changing this type requires a cache key version bump.
 */
export type RagDecisionSignature = {
  autoTriggered: boolean;
  winner: "base" | "auto" | null;
  altType: MultiQueryAltType;
  multiQueryRan: boolean;
  altQueryHash?: string | null;
};

export type ResponseCacheKeyArgs = {
  presetId: string;
  intent: string;
  messages: ChatMessage[];
  guardrails: {
    ragTopK: number;
    similarityThreshold: number;
    ragContextTokenBudget: number;
    ragContextClipTokens: number;
  };
  runtimeFlags: {
    reverseRagEnabled: boolean;
    reverseRagMode: ReverseRagMode;
    hydeEnabled: boolean;
    rankerMode: RankerMode;
    hydeMode: RagAutoMode;
    rewriteMode: RagAutoMode;
    ragMultiQueryMode: RagMultiQueryMode;
    ragMultiQueryMaxQueries: number;
  };
  decision?: RagDecisionSignature | null;
  resolvedProvider: string;
  resolvedModelId: string;
  requestedModelId: string | null;
  summaryHash: string;
};

export function buildResponseCacheKeyPayload(args: ResponseCacheKeyArgs) {
  const payload = {
    presetId: args.presetId,
    intent: args.intent,
    messages: args.messages,
    guardrails: args.guardrails,
    runtime: args.runtimeFlags,
    provider: args.resolvedProvider,
    resolvedModelId: args.resolvedModelId,
    requestedModelId: args.requestedModelId,
    summaryHash: args.summaryHash,
  } as Record<string, unknown>;

  if (args.decision) {
    payload.decision = args.decision;
  }

  return payload;
}

export function computeHistorySummaryHash(
  summaryMemory: string | null | undefined,
): string {
  return stableHash(summaryMemory ?? "");
}

export type RetrievalCacheKeyArgs = {
  presetId: string;
  question: string;
  ragTopK: number;
  similarityThreshold: number;
  candidateK: number;
  reverseRagEnabled: boolean;
  reverseRagMode: ReverseRagMode;
  hydeEnabled: boolean;
  rankerMode: RankerMode;
  hydeMode: RagAutoMode;
  rewriteMode: RagAutoMode;
  ragMultiQueryMode: RagMultiQueryMode;
  ragMultiQueryMaxQueries: number;
};

export function buildRetrievalCacheKeyPayload(
  args: RetrievalCacheKeyArgs,
): Record<string, unknown> {
  return {
    question: args.question,
    presetId: args.presetId,
    ragTopK: args.ragTopK,
    similarityThreshold: args.similarityThreshold,
    candidateK: args.candidateK,
    reverseRagEnabled: args.reverseRagEnabled,
    reverseRagMode: args.reverseRagMode,
    hydeEnabled: args.hydeEnabled,
    rankerMode: args.rankerMode,
    hydeMode: args.hydeMode,
    rewriteMode: args.rewriteMode,
    ragMultiQueryMode: args.ragMultiQueryMode,
    ragMultiQueryMaxQueries: args.ragMultiQueryMaxQueries,
  };
}

export function buildRetrievalCacheKey(args: RetrievalCacheKeyArgs): string {
  return `chat:retrieval:${args.presetId}:${hashPayload(
    buildRetrievalCacheKeyPayload(args),
  )}`;
}
