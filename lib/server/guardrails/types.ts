export type GuardrailChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatIntent = "knowledge" | "chitchat" | "command";

export type NormalizedQuestion = {
  raw: string;
  normalized: string;
  canonical: string;
  language: "en" | "ko" | "mixed" | "unknown";
};

export type RoutedQuestion = {
  question: NormalizedQuestion;
  intent: ChatIntent;
  confidence: number;
  reason: string;
};

export type ChatGuardrailConfig = {
  similarityThreshold: number;
  ragTopK: number;
  ragContextTokenBudget: number;
  ragContextClipTokens: number;
  historyTokenBudget: number;
  summary: {
    enabled: boolean;
    triggerTokens: number;
    maxChars: number;
    maxTurns: number;
  };
  chitchatKeywords: string[];
  fallbacks: {
    chitchat: string;
    command: string;
  };
};

export type RagDocument = {
  chunk?: string | null;
  similarity?: number | null;
  score?: number | null;
  metadata?: Record<string, any> | null;
  [key: string]: any;
};

export type SelectionUnit = "chunk" | "doc";

export type SelectionDedupMetrics = {
  selectionUnit: SelectionUnit;
  inputCount: number;
  uniqueBeforeDedupe: number;
  uniqueAfterDedupe: number;
  droppedByDedupe: number;
  dedupedDocs: RagDocument[];
};

export type ContextSelectionMetrics = {
  quotaStart: number;
  quotaEnd: number;
  quotaEndUsed: number;
  droppedByDedupe: number;
  droppedByQuota: number;
  uniqueDocs: number;
  mmrLite: boolean;
  mmrLambda: number;
  selectionUnit: SelectionUnit;
  inputCount: number;
  uniqueBeforeDedupe: number;
  uniqueAfterDedupe: number;
  finalSelectedCount: number;
  docSelection: {
    inputCount: number;
    uniqueBeforeDedupe: number;
    uniqueAfterDedupe: number;
    droppedByDedupe: number;
  };
};

export type ContextWindowResult = {
  contextBlock: string;
  included: Array<
    RagDocument & {
      prunedChunk: string;
      clipped: boolean;
      tokenCount: number;
    }
  >;
  dropped: number;
  totalTokens: number;
  insufficient: boolean;
  highestScore: number;
  selection?: ContextSelectionMetrics;
};

export type SanitizationChange = {
  key: string;
  from: unknown;
  to: unknown;
  reason: string;
};

export type HistoryWindowResult = {
  preserved: GuardrailChatMessage[];
  trimmed: GuardrailChatMessage[];
  tokenCount: number;
  summaryMemory: string | null;
};
