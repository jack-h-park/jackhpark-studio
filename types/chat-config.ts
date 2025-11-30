import type { DocType, PersonaType } from "@/lib/rag/metadata";
import type { ChatEngine } from "@/lib/shared/model-provider";
import type {
  EmbeddingModelId,
  LlmModelId,
  RankerId,
} from "@/lib/shared/models";
import type {
  ModelResolution,
  ModelResolutionReason,
} from "@/lib/shared/model-resolution";

export type SummaryLevel = "off" | "low" | "medium" | "high";

export interface AdminNumericLimit {
  min: number;
  max: number;
  default: number;
}

export interface SessionChatConfig {
  presetId?: string;
  additionalSystemPrompt?: string;
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
  llmModelResolution?: ModelResolution;
  features: {
    reverseRAG: boolean;
    hyde: boolean;
    ranker: RankerId;
  };
  summaryLevel: SummaryLevel;
  appliedPreset?: "default" | "fast" | "highRecall";
}

export type SessionChatConfigPreset = Omit<
  SessionChatConfig,
  "appliedPreset" | "presetId"
>;

export type RagRankingConfig = {
  docTypeWeights: Partial<Record<DocType, number>>;
  personaTypeWeights: Partial<Record<PersonaType, number>>;
};

export type PresetModelResolutions = Record<
  keyof AdminChatConfig["presets"],
  ModelResolution
>;

export type AdminChatRuntimeMeta = {
  defaultLlmModelId: LlmModelId;
  ollamaEnabled: boolean;
  presetResolutions: PresetModelResolutions;
};

export type { ModelResolution, ModelResolutionReason };

export interface AdminChatConfig {
  baseSystemPrompt?: string;
  baseSystemPromptSummary?: string;
  additionalPromptMaxLength?: number;
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
    default: AdminPresetConfig;
    fast: AdminPresetConfig;
    highRecall: AdminPresetConfig;
  };
  ragRanking?: RagRankingConfig;
}

export interface AdminPresetConfig extends SessionChatConfigPreset {
  additionalSystemPrompt?: string;
}

export const DEFAULT_ADDITIONAL_PROMPT_MAX_LENGTH = 500;

export function getAdditionalPromptMaxLength(
  config: AdminChatConfig,
): number {
  return config.additionalPromptMaxLength ?? DEFAULT_ADDITIONAL_PROMPT_MAX_LENGTH;
}
