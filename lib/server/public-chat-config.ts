import type {
  AdminChatConfig,
  AdminChatRuntimeMeta,
  AdminNumericLimit,
  AdminPresetConfig,
  ModelResolution,
} from "@/types/chat-config";
import type {
  PublicChatConfig,
  PublicChatPreset,
  PublicChatRuntimeMeta,
  PublicModelResolution,
  PublicNumericLimit,
} from "@/types/public-chat-config";

const toPublicNumericLimit = (
  limit: AdminNumericLimit,
): PublicNumericLimit => ({
  min: limit.min,
  max: limit.max,
  default: limit.default,
});

const toPublicPreset = (preset: AdminPresetConfig): PublicChatPreset => ({
  llmModel: preset.llmModel,
  embeddingModel: preset.embeddingModel,
  rag: {
    enabled: preset.rag.enabled,
    topK: preset.rag.topK,
    similarity: preset.rag.similarity,
  },
  context: {
    enabled: Boolean(preset.context.enabled),
    tokenBudget: preset.context.tokenBudget,
    historyBudget: preset.context.historyBudget,
    clipTokens: preset.context.clipTokens,
  },
  features: {
    reverseRAG: preset.features.reverseRAG,
    hyde: preset.features.hyde,
    ranker: preset.features.ranker,
  },
  summaryLevel: preset.summaryLevel,
  safeMode: Boolean(preset.safeMode),
  showTelemetry: Boolean(preset.showTelemetry),
  showCitations: Boolean(preset.showCitations),
});

export function toPublicChatConfig(config: AdminChatConfig): PublicChatConfig {
  const presets: PublicChatConfig["presets"] = {
    default: toPublicPreset(config.presets.default),
    fast: toPublicPreset(config.presets.fast),
    highRecall: toPublicPreset(config.presets.highRecall),
    precision: toPublicPreset(config.presets.precision),
  };
  for (const [key, preset] of Object.entries(config.presets)) {
    presets[key] = toPublicPreset(preset);
  }
  return {
    baseSystemPromptSummary: config.baseSystemPromptSummary ?? "",
    numericLimits: {
      ragTopK: toPublicNumericLimit(config.numericLimits.ragTopK),
      similarityThreshold: toPublicNumericLimit(
        config.numericLimits.similarityThreshold,
      ),
      contextBudget: toPublicNumericLimit(config.numericLimits.contextBudget),
      historyBudget: toPublicNumericLimit(config.numericLimits.historyBudget),
      clipTokens: toPublicNumericLimit(config.numericLimits.clipTokens),
    },
    allowlist: {
      llmModels: [...config.allowlist.llmModels],
      embeddingModels: [...config.allowlist.embeddingModels],
      rankers: [...config.allowlist.rankers],
      allowReverseRAG: config.allowlist.allowReverseRAG,
      allowHyde: config.allowlist.allowHyde,
    },
    summaryPresets: {
      low: { every_n_turns: config.summaryPresets.low.every_n_turns },
      medium: { every_n_turns: config.summaryPresets.medium.every_n_turns },
      high: { every_n_turns: config.summaryPresets.high.every_n_turns },
    },
    presets,
  };
}

const toPublicModelResolution = (
  resolution: ModelResolution,
): PublicModelResolution => ({
  requestedModelId: resolution.requestedModelId,
  resolvedModelId: resolution.resolvedModelId,
  wasSubstituted: resolution.wasSubstituted,
  reason: resolution.reason,
});

export function toPublicChatRuntimeMeta(
  meta: AdminChatRuntimeMeta,
): PublicChatRuntimeMeta {
  const presetResolutions: PublicChatRuntimeMeta["presetResolutions"] = {
    default: toPublicModelResolution(meta.presetResolutions.default),
    fast: toPublicModelResolution(meta.presetResolutions.fast),
    highRecall: toPublicModelResolution(meta.presetResolutions.highRecall),
    precision: toPublicModelResolution(meta.presetResolutions.precision),
  };
  for (const [key, resolution] of Object.entries(meta.presetResolutions)) {
    presetResolutions[key] = toPublicModelResolution(resolution);
  }
  return {
    defaultLlmModelId: meta.defaultLlmModelId,
    defaultLlmModelExplicit: meta.defaultLlmModelExplicit,
    ollamaConfigured: meta.ollamaConfigured,
    lmstudioConfigured: meta.lmstudioConfigured,
    presetResolutions,
  };
}
