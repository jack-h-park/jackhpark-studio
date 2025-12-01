import type { AdminChatConfig, RagRankingConfig } from "@/types/chat-config";

import { DOC_TYPE_WEIGHTS, PERSONA_WEIGHTS } from "./ranking";
import {
  type ChatConfigSnapshot,
  type GuardrailRoute,
} from "./types";

export function buildChatConfigSnapshot(
  adminConfig: AdminChatConfig,
  presetKey: keyof AdminChatConfig["presets"] | string,
  options?: {
    basePromptVersion?: string;
    guardrailRoute?: GuardrailRoute;
  },
): ChatConfigSnapshot {
  const preset =
    adminConfig.presets[
      presetKey as keyof typeof adminConfig.presets
    ] ?? adminConfig.presets.default;

  const ranking: RagRankingConfig | undefined = adminConfig.ragRanking;

  return {
    presetKey: String(presetKey),

    chatEngine: preset.chatEngine,
    llmModel: preset.llmModel,
    embeddingModel: preset.embeddingModel,

    rag: {
      enabled: preset.rag.enabled,
      topK: preset.rag.topK,
      similarity: preset.rag.similarity,

      ranker: preset.features.ranker,
      reverseRAG: preset.features.reverseRAG,
      hyde: preset.features.hyde,
      summaryLevel: preset.summaryLevel,

      numericLimits: {
        ragTopK: adminConfig.numericLimits.ragTopK.default,
        similarityThreshold: adminConfig.numericLimits.similarityThreshold.default,
      },

      ranking: {
        docTypeWeights: {
          ...DOC_TYPE_WEIGHTS,
          ...(ranking?.docTypeWeights ?? {}),
        },
        personaTypeWeights: {
          ...PERSONA_WEIGHTS,
          ...(ranking?.personaTypeWeights ?? {}),
        },
      },
    },

    context: {
      tokenBudget: preset.context.tokenBudget,
      historyBudget: preset.context.historyBudget,
      clipTokens: preset.context.clipTokens,
    },

    telemetry: {
      sampleRate: adminConfig.telemetry.sampleRate,
      detailLevel: adminConfig.telemetry.detailLevel,
    },

    cache: {
      responseTtlSeconds: adminConfig.cache.responseTtlSeconds,
      retrievalTtlSeconds: adminConfig.cache.retrievalTtlSeconds,
      responseEnabled: adminConfig.cache.responseTtlSeconds > 0,
      retrievalEnabled: adminConfig.cache.retrievalTtlSeconds > 0,
    },

    prompt: {
      baseVersion: options?.basePromptVersion,
    },

    guardrails: {
      route: options?.guardrailRoute,
    },
  };
}

/**
 * @deprecated Use buildChatConfigSnapshot instead.
 */
export function buildRagConfigSnapshot(
  adminConfig: AdminChatConfig,
  presetKey: keyof AdminChatConfig["presets"] | string,
): ChatConfigSnapshot {
  return buildChatConfigSnapshot(adminConfig, presetKey);
}

export { type ChatConfigSnapshot } from "./types";
export { type RagConfigSnapshot } from "./types";
export { type GuardrailRoute } from "./types";
