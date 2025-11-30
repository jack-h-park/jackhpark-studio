import type { ChatEngine } from "@/lib/shared/model-provider";
import type {
  EmbeddingModelId,
  LlmModelId,
  RankerId,
} from "@/lib/shared/models";
import type { DocType, PersonaType } from "@/lib/rag/metadata";

export type SummaryLevel = "off" | "low" | "medium" | "high";

export interface AdminNumericLimit {
  min: number;
  max: number;
  default: number;
}

export interface SessionChatConfig {
  userSystemPrompt: string;
  llmModel: LlmModelId;
  embeddingModel: EmbeddingModelId;
  chatEngine: ChatEngine;
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
    ranker: RankerId;
  };
  summaryLevel: SummaryLevel;
  appliedPreset?: "default" | "fast" | "highRecall";
}

export type SessionChatConfigPreset = Omit<SessionChatConfig, "appliedPreset">;

export type RagRankingConfig = {
  docTypeWeights: Partial<Record<DocType, number>>;
  personaTypeWeights: Partial<Record<PersonaType, number>>;
};

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
    chatEngines: ChatEngine[];
    llmModels: LlmModelId[];
    embeddingModels: EmbeddingModelId[];
    rankers: RankerId[];
    allowReverseRAG: boolean;
    allowHyde: boolean;
  };
  guardrails: {
    chitchatKeywords: string[];
    fallbackChitchat: string;
    fallbackCommand: string;
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
  ragRanking?: RagRankingConfig;
}
