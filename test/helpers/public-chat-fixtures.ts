import type {
  AdminChatConfig,
  AdminChatRuntimeMeta,
} from "@/types/chat-config";
import { DEFAULT_ADMIN_CHAT_PRESETS } from "@/lib/server/admin-chat-config";

export function chatConfigFixture(): AdminChatConfig {
  return {
    baseSystemPrompt: "PRIVATE_CONFIG_SENTINEL",
    baseSystemPromptSummary: "Public summary",
    numericLimits: {
      ragTopK: { min: 1, max: 20, default: 6 },
      similarityThreshold: { min: 0, max: 1, default: 0.4 },
      contextBudget: { min: 512, max: 4096, default: 2048 },
      historyBudget: { min: 256, max: 2048, default: 1024 },
      clipTokens: { min: 32, max: 512, default: 128 },
    },
    allowlist: {
      llmModels: ["gpt-4o-mini"],
      embeddingModels: ["text-embedding-3-small"],
      rankers: ["none"],
      allowReverseRAG: false,
      allowHyde: false,
    },
    guardrails: {
      chitchatKeywords: [],
      fallbackChitchat: "Private fallback",
      fallbackCommand: "Private command",
    },
    summaryPresets: {
      low: { every_n_turns: 2 },
      medium: { every_n_turns: 4 },
      high: { every_n_turns: 6 },
    },
    presets: structuredClone(DEFAULT_ADMIN_CHAT_PRESETS),
    telemetry: { sampleRate: 1, detailLevel: "standard" },
    cache: { responseTtlSeconds: 300, retrievalTtlSeconds: 60 },
  };
}

export function runtimeMetaFixture(): AdminChatRuntimeMeta {
  const resolution = {
    requestedModelId: "gpt-4o-mini",
    resolvedModelId: "gpt-4o-mini",
    wasSubstituted: false,
    reason: "NONE" as const,
  };
  return {
    defaultLlmModelId: "gpt-4o-mini",
    defaultLlmModelExplicit: true,
    ollamaConfigured: false,
    lmstudioConfigured: false,
    localLlmBackendEnv: "ollama",
    presetResolutions: {
      default: resolution,
      fast: resolution,
      highRecall: resolution,
      precision: resolution,
    },
  };
}
