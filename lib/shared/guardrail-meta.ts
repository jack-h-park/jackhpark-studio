import { type RankerMode, type ReverseRagMode } from "@/lib/shared/rag-config";

export type GuardrailMetaContext = {
  included: number;
  dropped: number;
  totalTokens: number;
  insufficient: boolean;
  retrieved?: number;
  similarityThreshold?: number;
  highestSimilarity?: number;
  contextTokenBudget?: number;
  contextClipTokens?: number;
};

export type GuardrailMetaHistory = {
  tokens: number;
  budget: number;
  trimmedTurns: number;
  preservedTurns: number;
};

export type GuardrailEnhancements = {
  reverseRag?: {
    enabled: boolean;
    mode: ReverseRagMode;
    original: string;
    rewritten: string;
  };
  hyde?: {
    enabled: boolean;
    generated: string | null;
  };
  ranker?: {
    mode: RankerMode;
  };
};

export type GuardrailMeta = {
  intent: string;
  reason: string;
  historyTokens: number;
  summaryApplied: boolean;
  history?: GuardrailMetaHistory;
  context: GuardrailMetaContext;
  llmModel?: string;
  provider?: string;
  embeddingModel?: string;
  enhancements?: GuardrailEnhancements;
  summaryConfig?: {
    enabled: boolean;
    triggerTokens: number;
    maxTurns: number;
    maxChars: number;
  };
  summaryInfo?: {
    originalTokens: number;
    summaryTokens: number;
    trimmedTurns: number;
    maxTurns: number;
  };
};

export function serializeGuardrailMeta(meta: GuardrailMeta): string {
  return JSON.stringify(meta);
}

export function deserializeGuardrailMeta(
  value: string | null | undefined,
): GuardrailMeta | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as GuardrailMeta;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(value)) as GuardrailMeta;
    } catch {
      return null;
    }
  }
}
