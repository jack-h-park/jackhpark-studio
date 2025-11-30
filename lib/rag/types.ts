import type { AdminChatConfig } from "@/types/chat-config";

import type { DocType, PersonaType } from "./metadata";

export type RagConfigSnapshot = {
  presetKey?: string;
  chatEngine?: string;
  llmModel?: string;
  embeddingModel?: string;
  ragEnabled?: boolean;
  ragTopK?: number;
  ragSimilarity?: number;
  ranker?: string;
  reverseRAG?: boolean;
  hyde?: boolean;
  summaryLevel?: string;
  contextTokenBudget?: number;
  historyBudget?: number;
  clipTokens?: number;
  numericLimits?: {
    ragTopK?: AdminChatConfig["numericLimits"]["ragTopK"];
    similarityThreshold?: AdminChatConfig["numericLimits"]["similarityThreshold"];
  };
  ragRanking?: {
    docTypeWeights: Partial<Record<DocType, number>>;
    personaTypeWeights: Partial<Record<PersonaType, number>>;
  };
};
