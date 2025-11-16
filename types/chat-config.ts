export type SummaryLevel = "off" | "low" | "medium" | "high";

export interface AdminNumericLimit {
  min: number;
  max: number;
  default: number;
}

export interface SessionChatConfig {
  userSystemPrompt: string;
  llmModel: string;
  embeddingModel: string;
  chatEngine: string;
  rag: {
    enabled: boolean;
    topK: number;
    similarity: number;
  };
  context: {
    tokenBudget: number;
    historyBudget: number;
    clipTokens: number;
  };
  features: {
    reverseRAG: boolean;
    hyde: boolean;
    ranker: string;
  };
  summaryLevel: SummaryLevel;
  appliedPreset?: "default" | "fast" | "highRecall";
}

export type SessionChatConfigPreset = Omit<
  SessionChatConfig,
  "appliedPreset"
>;

export interface AdminChatConfig {
  coreSystemPromptSummary: string;
  userSystemPromptDefault: string;
  userSystemPromptMaxLength: number;
  numericLimits: {
    ragTopK: AdminNumericLimit;
    similarityThreshold: AdminNumericLimit;
    contextBudget: AdminNumericLimit;
    historyBudget: AdminNumericLimit;
    clipTokens: AdminNumericLimit;
  };
  allowlist: {
    chatEngines: string[];
    llmModels: string[];
    embeddingModels: string[];
    rankers: string[];
    allowReverseRAG: boolean;
    allowHyde: boolean;
  };
  summaryPresets: {
    low: {
      every_n_turns: number;
    };
    medium: {
      every_n_turns: number;
    };
    high: {
      every_n_turns: number;
    };
  };
  presets: {
    default: SessionChatConfigPreset;
    fast: SessionChatConfigPreset;
    highRecall: SessionChatConfigPreset;
  };
}
