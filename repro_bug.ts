type AdminChatConfig = {
  allowlist: {
    llmModels: string[];
    embeddingModels: string[];
    [key: string]: any;
  };
  presets: {
    default: any;
    [key: string]: any;
  };
  numericLimits: {
    ragTopK: { min: number; max: number; default: number };
    similarityThreshold: { min: number; max: number; default: number };
    contextBudget: { min: number; max: number; default: number };
    historyBudget: { min: number; max: number; default: number };
    clipTokens: { min: number; max: number; default: number };
  };
};

type SessionChatConfig = {
  llmModel: string;
  embeddingModel: string;
  [key: string]: any;
};

// Mock dependencies
const sanitizeModel = <T extends string>(
  value: string | undefined,
  allowlistValues: readonly T[],
  fallback: T,
): T => {
  if (value && allowlistValues.length === 0) {
    return value as T;
  }
  if (value && allowlistValues.includes(value as T)) {
    return value as T;
  }
  return allowlistValues[0] ?? fallback;
};

// Extracted from ChatConfigContext.tsx
const sanitizeNumericConfig = (
  candidate: SessionChatConfig,
  adminConfig: AdminChatConfig,
): SessionChatConfig => {
  const { allowlist } = adminConfig;

  // Simplified logic for models
  const requestedModelId = candidate.llmModel; // Simplified resolution logic

  return {
    ...candidate,
    llmModel: requestedModelId,
    embeddingModel: sanitizeModel(
      candidate.embeddingModel,
      allowlist.embeddingModels,
      adminConfig.presets.default.embeddingModel,
    ),
  };
};

// Simulation
const adminConfig: AdminChatConfig = {
  allowlist: {
    llmModels: ["gpt-4o", "gpt-3.5-turbo"],
    embeddingModels: ["openai-ada", "local-embedding"],
    chatEngines: [],
    rankers: [],
  },
  presets: {
    default: {
      llmModel: "gpt-4o",
      embeddingModel: "openai-ada",
      rag: { topK: 5, similarity: 0.5 },
      context: { tokenBudget: 1000, historyBudget: 500, clipTokens: 100 },
    },
  },
  numericLimits: {
    ragTopK: { min: 1, max: 10, default: 5 },
    similarityThreshold: { min: 0, max: 1, default: 0.5 },
    contextBudget: { min: 100, max: 1000, default: 100 },
    historyBudget: { min: 10, max: 100, default: 10 },
    clipTokens: { min: 10, max: 100, default: 10 },
  },
};

const currentConfig: SessionChatConfig = {
  ...adminConfig.presets.default,
  llmModel: "gpt-4o",
  embeddingModel: "openai-ada",
  rag: { topK: 5, similarity: 0.5 },
  context: { tokenBudget: 1000, historyBudget: 500, clipTokens: 100 },
  features: {},
};

console.log(
  "Initial State:",
  currentConfig.llmModel,
  currentConfig.embeddingModel,
);

// 1. User changes LLM to gpt-3.5-turbo
console.log("--- Changing LLM to gpt-3.5-turbo ---");

const updater = (prev: SessionChatConfig) => ({
  ...prev,
  llmModel: "gpt-3.5-turbo",
});

const nextCandidate = updater(currentConfig);
// Simulate setSessionConfig logic
const nextConfig = sanitizeNumericConfig(nextCandidate, adminConfig);

console.log("New State:", nextConfig.llmModel, nextConfig.embeddingModel);

if (nextConfig.embeddingModel !== currentConfig.embeddingModel) {
  console.error("BUG REPRODUCED: Embedding model changed!");
} else {
  console.log("No bug in simulation.");
}

// 2. User changes Embedding to local-embedding
console.log("--- Changing Embedding to local-embedding ---");
const updater2 = (prev: SessionChatConfig) => ({
  ...prev,
  embeddingModel: "local-embedding",
});

const nextCandidate2 = updater2(nextConfig);
const nextConfig2 = sanitizeNumericConfig(nextCandidate2, adminConfig);
console.log("New State 2:", nextConfig2.llmModel, nextConfig2.embeddingModel);

// 3. User changes LLM back to gpt-4o
console.log("--- Changing LLM back to gpt-4o ---");
const updater3 = (prev: SessionChatConfig) => ({
  ...prev,
  llmModel: "gpt-4o",
});

const nextCandidate3 = updater3(nextConfig2);
const nextConfig3 = sanitizeNumericConfig(nextCandidate3, adminConfig);
console.log("New State 3:", nextConfig3.llmModel, nextConfig3.embeddingModel);

if (nextConfig3.embeddingModel !== nextConfig2.embeddingModel) {
  console.error("BUG REPRODUCED: Embedding model changed on LLM revert!");
} else {
  console.log("No bug in simulation.");
}
