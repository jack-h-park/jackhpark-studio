import type { ModelResolutionReason } from "@/lib/shared/model-resolution";
import type {
  EmbeddingModelId,
  LlmModelId,
  RankerId,
} from "@/lib/shared/models";
import type { SummaryLevel } from "@/types/chat-config";

export interface PublicNumericLimit {
  min: number;
  max: number;
  default: number;
}

export interface PublicChatPreset {
  llmModel: LlmModelId;
  embeddingModel: EmbeddingModelId;
  rag: { enabled: boolean; topK: number; similarity: number };
  context: {
    enabled: boolean;
    tokenBudget: number;
    historyBudget: number;
    clipTokens: number;
  };
  features: { reverseRAG: boolean; hyde: boolean; ranker: RankerId };
  summaryLevel: SummaryLevel;
  safeMode: boolean;
  showTelemetry: boolean;
  showCitations: boolean;
}

export type PublicChatPresets = Record<string, PublicChatPreset> & {
  default: PublicChatPreset;
  fast: PublicChatPreset;
  highRecall: PublicChatPreset;
  precision: PublicChatPreset;
};

export interface PublicChatConfig {
  baseSystemPromptSummary: string;
  numericLimits: {
    ragTopK: PublicNumericLimit;
    similarityThreshold: PublicNumericLimit;
    contextBudget: PublicNumericLimit;
    historyBudget: PublicNumericLimit;
    clipTokens: PublicNumericLimit;
  };
  allowlist: {
    llmModels: LlmModelId[];
    embeddingModels: EmbeddingModelId[];
    rankers: RankerId[];
    allowReverseRAG: boolean;
    allowHyde: boolean;
  };
  summaryPresets: {
    low: { every_n_turns: number };
    medium: { every_n_turns: number };
    high: { every_n_turns: number };
  };
  presets: PublicChatPresets;
}

export interface PublicModelResolution {
  requestedModelId: string;
  resolvedModelId: string;
  wasSubstituted: boolean;
  reason: ModelResolutionReason;
}

export interface PublicChatRuntimeMeta {
  defaultLlmModelId: LlmModelId;
  defaultLlmModelExplicit: boolean;
  ollamaConfigured: boolean;
  lmstudioConfigured: boolean;
  presetResolutions: Record<string, PublicModelResolution> & {
    default: PublicModelResolution;
    fast: PublicModelResolution;
    highRecall: PublicModelResolution;
    precision: PublicModelResolution;
  };
}
