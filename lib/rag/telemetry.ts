import type { AdminChatConfig, RagRankingConfig } from "@/types/chat-config";

import { DOC_TYPE_WEIGHTS, PERSONA_WEIGHTS } from "./ranking";
import { type RagConfigSnapshot } from "./types";



export function buildRagConfigSnapshot(
  adminConfig: AdminChatConfig,
  presetKey: keyof AdminChatConfig["presets"] | string,
): RagConfigSnapshot {
  const preset =
    adminConfig.presets[
      presetKey as keyof typeof adminConfig.presets
    ] ?? adminConfig.presets.default;
  const ranking: RagRankingConfig | undefined = adminConfig.ragRanking;

  return {
    presetKey,
    chatEngine: preset.chatEngine,
    llmModel: preset.llmModel,
    embeddingModel: preset.embeddingModel,

    ragEnabled: preset.rag.enabled,
    ragTopK: preset.rag.topK,
    ragSimilarity: preset.rag.similarity,

    ranker: preset.features.ranker,
    reverseRAG: preset.features.reverseRAG,
    hyde: preset.features.hyde,
    summaryLevel: preset.summaryLevel,

    contextTokenBudget: preset.context.tokenBudget,
    historyBudget: preset.context.historyBudget,
    clipTokens: preset.context.clipTokens,

    numericLimits: {
      ragTopK: adminConfig.numericLimits.ragTopK,
      similarityThreshold: adminConfig.numericLimits.similarityThreshold,
    },

    ragRanking: {
      docTypeWeights: ranking?.docTypeWeights ?? DOC_TYPE_WEIGHTS,
      personaTypeWeights: ranking?.personaTypeWeights ?? PERSONA_WEIGHTS,
    },
  };
}

export {type RagConfigSnapshot} from "./types";