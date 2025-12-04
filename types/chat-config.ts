import type { LocalLlmBackend } from "@/lib/local-llm/client";
import type { DocType, PersonaType } from "@/lib/rag/metadata";
import type { ChatEngine } from "@/lib/shared/model-provider";
import type {
  ModelResolution,
} from "@/lib/shared/model-resolution";
import type {
  EmbeddingModelId,
  LlmModelId,
  RankerId,
} from "@/lib/shared/models";

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
  requireLocal?: boolean;
}

export type SessionChatConfigPreset = Omit<
  SessionChatConfig,
  "appliedPreset" | "presetId"
>;

export type RagRankingConfig = {
  docTypeWeights: Partial<Record<DocType, number>>;
  personaTypeWeights: Partial<Record<PersonaType, number>>;
};

export type TelemetryDetailLevel = "minimal" | "standard" | "verbose";

export type AdminTelemetryConfig = {
  /**
   * Global sampling rate for sending traces to Langfuse.
   * 1.0 = log all requests, 0.1 = 10% sample, 0 = disabled.
   */
  sampleRate: number;

  /**
   * Controls how much detail we send in traces.
   * - minimal: top-level status, tokens, latency
   * - standard: includes config snapshot (RAG, context, etc.)
   * - verbose: includes additional debugging metadata (e.g., candidate chunks)
   */
  detailLevel: TelemetryDetailLevel;
};

export type AdminCacheConfig = {
  /**
   * TTL for full chat response cache (in seconds).
   * 0 effectively disables response caching.
   */
  responseTtlSeconds: number;

  /**
   * TTL for retrieval cache (in seconds, e.g. chunk retrieval/embeddings).
   * 0 effectively disables retrieval caching.
   */
  retrievalTtlSeconds: number;
};

export type PresetModelResolutions = Record<
  keyof AdminChatConfig["presets"],
  ModelResolution
>;

export type AdminChatRuntimeMeta = {
  defaultLlmModelId: LlmModelId;
  ollamaEnabled: boolean;
  lmstudioEnabled: boolean;
  localLlmBackendEnv: LocalLlmBackend | null;
  presetResolutions: PresetModelResolutions;
};



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
  presets: AdminChatPresetsConfig;
  ragRanking?: RagRankingConfig;
  telemetry: AdminTelemetryConfig;
  cache: AdminCacheConfig;
}

export interface AdminPresetConfig extends SessionChatConfigPreset {
  additionalSystemPrompt?: string;
  requireLocal?: boolean;
}

export type AdminChatPresetsConfig = Record<string, AdminPresetConfig> & {
  default: AdminPresetConfig;
  fast: AdminPresetConfig;
  highRecall: AdminPresetConfig;
};

export type ChatEngineType =
  | "openai"
  | "gemini"
  | "local-ollama"
  | "local-lmstudio"
  | "unknown";

export const DEFAULT_ADDITIONAL_PROMPT_MAX_LENGTH = 500;

export function getAdditionalPromptMaxLength(
  config: AdminChatConfig,
): number {
  return config.additionalPromptMaxLength ?? DEFAULT_ADDITIONAL_PROMPT_MAX_LENGTH;
}

export {type ModelResolution, type ModelResolutionReason} from "@/lib/shared/model-resolution";
