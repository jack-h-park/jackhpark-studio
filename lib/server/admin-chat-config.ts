import type { EmbeddingModelId, LlmModelId } from "@/lib/shared/models";
import type {
  AdminChatConfig,
  SessionChatConfigPreset,
} from "@/types/chat-config";
import {
  DEFAULT_SYSTEM_PROMPT,
  SYSTEM_PROMPT_MAX_LENGTH,
  SYSTEM_SETTINGS_TABLE,
} from "@/lib/chat-prompts";
import {
  findEmbeddingSpace,
  listEmbeddingModelOptions,
} from "@/lib/core/embedding-spaces";
import { listLlmModelOptions } from "@/lib/core/llm-registry";
import { supabaseClient } from "@/lib/core/supabase";
import {
  getChatModelDefaults,
  loadGuardrailSettings,
} from "@/lib/server/chat-settings";
import {
  CHAT_ENGINE_OPTIONS,
  type ChatEngine,
  normalizeChatEngine,
} from "@/lib/shared/model-provider";
import {
  DEFAULT_HYDE_ENABLED,
  DEFAULT_RANKER_MODE,
  DEFAULT_REVERSE_RAG_ENABLED,
  RANKER_MODES,
} from "@/lib/shared/rag-config";

export const ADMIN_CONFIG_SETTING_KEY = "admin_chat_config";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const buildSummaryPresets = (guardrailSummary: {
  summaryTriggerTokens: number;
  summaryMaxTurns: number;
  summaryMaxChars: number;
}): AdminChatConfig["summaryPresets"] => {
  const baseTurns = Math.max(3, guardrailSummary.summaryMaxTurns);
  return {
    low: {
      every_n_turns: Math.max(6, Math.round(baseTurns * 1.4)),
    },
    medium: {
      every_n_turns: baseTurns,
    },
    high: {
      every_n_turns: Math.max(3, Math.round(baseTurns * 0.75)),
    },
  };
};

const buildBasePreset = (
  guardrails: Awaited<ReturnType<typeof loadGuardrailSettings>>,
  modelDefaults: ReturnType<typeof getChatModelDefaults>,
): SessionChatConfigPreset => ({
  userSystemPrompt: DEFAULT_SYSTEM_PROMPT,
  llmModel: modelDefaults.llmModelId as LlmModelId,
  embeddingModel: modelDefaults.embeddingModel as EmbeddingModelId,
  chatEngine: modelDefaults.engine,
  rag: {
    enabled: true,
    topK: guardrails.numeric.ragTopK,
    similarity: guardrails.numeric.similarityThreshold,
  },
  context: {
    tokenBudget: guardrails.numeric.ragContextTokenBudget,
    historyBudget: guardrails.numeric.historyTokenBudget,
    clipTokens: guardrails.numeric.ragContextClipTokens,
  },
  features: {
    reverseRAG: DEFAULT_REVERSE_RAG_ENABLED,
    hyde: DEFAULT_HYDE_ENABLED,
    ranker: DEFAULT_RANKER_MODE,
  },
  summaryLevel: guardrails.numeric.summaryEnabled ? "medium" : "off",
});

const buildPreset = (
  base: SessionChatConfigPreset,
  overrides: Partial<SessionChatConfigPreset>,
): SessionChatConfigPreset => ({
  ...base,
  ...overrides,
  rag: {
    ...base.rag,
    ...overrides.rag,
  },
  context: {
    ...base.context,
    ...overrides.context,
  },
  features: {
    ...base.features,
    ...overrides.features,
  },
});

type AdminConfigRow = {
  value: unknown;
  updated_at: string | null;
};

async function fetchStoredAdminConfigRow(): Promise<AdminConfigRow | null> {
  try {
    const { data, error } = await supabaseClient
      .from(SYSTEM_SETTINGS_TABLE)
      .select("value, updated_at")
      .eq("key", ADMIN_CONFIG_SETTING_KEY)
      .maybeSingle();
    if (error) {
      console.error(
        "[admin-chat-config] failed to load stored config row",
        error,
      );
      return null;
    }
    return data ?? null;
  } catch (err) {
    console.error(
      "[admin-chat-config] unexpected error loading stored config row",
      err,
    );
    return null;
  }
}

const parseStoredConfigValue = (
  value: unknown,
): Partial<AdminChatConfig> | null => {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Partial<AdminChatConfig>;
    } catch (err) {
      console.error("[admin-chat-config] failed to parse stored JSON", err);
      return null;
    }
  }
  if (typeof value === "object") {
    return value as Partial<AdminChatConfig>;
  }
  return null;
};

async function loadStoredAdminConfig(): Promise<Partial<AdminChatConfig> | null> {
  const row = await fetchStoredAdminConfigRow();
  if (!row?.value) {
    return null;
  }
  return parseStoredConfigValue(row.value);
}

export async function getAdminChatConfigMetadata(): Promise<{
  updatedAt: string | null;
}> {
  const row = await fetchStoredAdminConfigRow();
  return {
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveAdminChatConfig(config: AdminChatConfig): Promise<{
  updatedAt: string | null;
}> {
  const payload = {
    key: ADMIN_CONFIG_SETTING_KEY,
    value: JSON.stringify(config),
  };
  const { data, error } = await supabaseClient
    .from(SYSTEM_SETTINGS_TABLE)
    .upsert(payload, { onConflict: "key" })
    .select("updated_at")
    .single();
  if (error) {
    console.error("[admin-chat-config] failed to save config", error);
    throw error;
  }
  return { updatedAt: data?.updated_at ?? null };
}

function mergeNumericLimits(
  base: AdminChatConfig["numericLimits"],
  override?: Partial<AdminChatConfig["numericLimits"]>,
): AdminChatConfig["numericLimits"] {
  if (!override) {
    return base;
  }
  const keys: (keyof AdminChatConfig["numericLimits"])[] = [
    "ragTopK",
    "similarityThreshold",
    "contextBudget",
    "historyBudget",
    "clipTokens",
  ];
  return keys.reduce(
    (acc, key) => {
      acc[key] = override[key] ?? base[key];
      return acc;
    },
    {} as AdminChatConfig["numericLimits"],
  );
}

const normalizeChatEngineList = (
  values: string[] | undefined,
): ChatEngine[] => {
  const seen = new Set<ChatEngine>();
  const list = values ?? [];
  for (const value of list) {
    const normalized = normalizeChatEngine(value);
    if (!seen.has(normalized)) {
      seen.add(normalized);
    }
  }
  return [...seen];
};

const normalizeEmbeddingAllowlist = (
  values?: string[] | undefined,
): string[] => {
  if (!values || values.length === 0) {
    return [];
  }
  const normalized = new Set<string>();
  for (const value of values) {
    const space = findEmbeddingSpace(value);
    if (space) {
      normalized.add(space.embeddingSpaceId);
    }
  }
  return Array.from(normalized).toSorted((a, b) => a.localeCompare(b));
};

function mergeAllowlist(
  base: AdminChatConfig["allowlist"],
  override?: Partial<AdminChatConfig["allowlist"]>,
): AdminChatConfig["allowlist"] {
  if (!override) {
    return base;
  }
  const allowedRankers = new Set(base.rankers);
  let rankers =
    override.rankers?.filter((ranker) => allowedRankers.has(ranker)) ??
    base.rankers;
  if (allowedRankers.has("mmr") && !rankers.includes("mmr")) {
    rankers = [...rankers, "mmr"];
  }
  const chatEngines = normalizeChatEngineList(
    override.chatEngines ?? base.chatEngines,
  );
  const overrideEmbeddingModels = normalizeEmbeddingAllowlist(
    override.embeddingModels,
  );
  const embeddingModels =
    overrideEmbeddingModels.length > 0
      ? overrideEmbeddingModels
      : base.embeddingModels;
  return {
    chatEngines: chatEngines.length > 0 ? chatEngines : base.chatEngines,
    llmModels: override.llmModels ?? base.llmModels,
    embeddingModels,
    rankers,
    allowReverseRAG: override.allowReverseRAG ?? base.allowReverseRAG,
    allowHyde: override.allowHyde ?? base.allowHyde,
  };
}

function mergeGuardrails(
  base: AdminChatConfig["guardrails"],
  override?: Partial<AdminChatConfig["guardrails"]>,
): AdminChatConfig["guardrails"] {
  if (!override) {
    return base;
  }
  return {
    chitchatKeywords: override.chitchatKeywords ?? base.chitchatKeywords,
    fallbackChitchat: override.fallbackChitchat ?? base.fallbackChitchat,
    fallbackCommand: override.fallbackCommand ?? base.fallbackCommand,
  };
}

function mergeSummaryPresets(
  base: AdminChatConfig["summaryPresets"],
  override?: Partial<AdminChatConfig["summaryPresets"]>,
): AdminChatConfig["summaryPresets"] {
  if (!override) {
    return base;
  }
  const keys: Array<keyof AdminChatConfig["summaryPresets"]> = [
    "low",
    "medium",
    "high",
  ];
  return keys.reduce(
    (acc, key) => {
      acc[key] = override[key]
        ? {
            every_n_turns:
              override[key]!.every_n_turns ?? base[key].every_n_turns,
          }
        : base[key];
      return acc;
    },
    {} as AdminChatConfig["summaryPresets"],
  );
}

function mergePresets(
  base: AdminChatConfig["presets"],
  override?: Partial<AdminChatConfig["presets"]>,
): AdminChatConfig["presets"] {
  if (!override) {
    return base;
  }
  const keys: Array<keyof AdminChatConfig["presets"]> = [
    "default",
    "fast",
    "highRecall",
  ];
  return keys.reduce(
    (acc, key) => {
      acc[key] = mergeSessionPreset(base[key], override[key]);
      return acc;
    },
    {} as AdminChatConfig["presets"],
  );
}

function mergeSessionPreset(
  base: SessionChatConfigPreset,
  override?: Partial<SessionChatConfigPreset>,
): SessionChatConfigPreset {
  if (!override) {
    return base;
  }
  return {
    ...base,
    ...override,
    rag: {
      ...base.rag,
      ...override.rag,
    },
    context: {
      ...base.context,
      ...override.context,
    },
    features: {
      ...base.features,
      ...override.features,
    },
  };
}

export async function getAdminChatConfig(): Promise<AdminChatConfig> {
  const guardrails = await loadGuardrailSettings({ forceRefresh: true });
  const modelDefaults = getChatModelDefaults();

  const baseConfig = buildComputedAdminConfig(guardrails, modelDefaults);
  const storedConfig = await loadStoredAdminConfig();

  if (!storedConfig) {
    return baseConfig;
  }

  return {
    coreSystemPromptSummary:
      storedConfig.coreSystemPromptSummary ??
      baseConfig.coreSystemPromptSummary,
    userSystemPromptDefault:
      storedConfig.userSystemPromptDefault ??
      baseConfig.userSystemPromptDefault,
    userSystemPromptMaxLength:
      storedConfig.userSystemPromptMaxLength ??
      baseConfig.userSystemPromptMaxLength,
    numericLimits: mergeNumericLimits(
      baseConfig.numericLimits,
      storedConfig.numericLimits,
    ),
    allowlist: mergeAllowlist(baseConfig.allowlist, storedConfig.allowlist),
    guardrails: mergeGuardrails(baseConfig.guardrails, storedConfig.guardrails),
    summaryPresets: mergeSummaryPresets(
      baseConfig.summaryPresets,
      storedConfig.summaryPresets,
    ),
    presets: mergePresets(baseConfig.presets, storedConfig.presets),
  };
}

function buildComputedAdminConfig(
  guardrails: Awaited<ReturnType<typeof loadGuardrailSettings>>,
  modelDefaults: ReturnType<typeof getChatModelDefaults>,
): AdminChatConfig {
  const llmAllowlist = listLlmModelOptions().map((option) => option.id);
  const embeddingAllowlist = listEmbeddingModelOptions().map(
    (space) => space.embeddingSpaceId,
  );

  const allowlist: AdminChatConfig["allowlist"] = {
    chatEngines: CHAT_ENGINE_OPTIONS,
    llmModels: llmAllowlist,
    embeddingModels: embeddingAllowlist,
    rankers: [...RANKER_MODES],
    allowReverseRAG: true,
    allowHyde: true,
  };

  const defaultRanker = allowlist.rankers.includes("mmr")
    ? "mmr"
    : (allowlist.rankers[0] ?? "none");

  const numericLimits: AdminChatConfig["numericLimits"] = {
    ragTopK: {
      min: 1,
      max: 20,
      default: clamp(guardrails.numeric.ragTopK, 1, 20),
    },
    similarityThreshold: {
      min: 0.3,
      max: 0.99,
      default: clamp(guardrails.numeric.similarityThreshold, 0.3, 0.99),
    },
    contextBudget: {
      min: 500,
      max: 4000,
      default: clamp(guardrails.numeric.ragContextTokenBudget, 500, 4000),
    },
    historyBudget: {
      min: 200,
      max: 2000,
      default: clamp(guardrails.numeric.historyTokenBudget, 200, 2000),
    },
    clipTokens: {
      min: 32,
      max: 1024,
      default: clamp(guardrails.numeric.ragContextClipTokens, 32, 1024),
    },
  };

  const basePreset = buildBasePreset(guardrails, modelDefaults);

  const presets: AdminChatConfig["presets"] = {
    default: basePreset,
    fast: buildPreset(basePreset, {
      rag: {
        enabled: false,
        topK: clamp(
          numericLimits.ragTopK.min,
          numericLimits.ragTopK.min,
          numericLimits.ragTopK.max,
        ),
        similarity: clamp(
          Math.min(
            numericLimits.similarityThreshold.max,
            basePreset.rag.similarity + 0.05,
          ),
          numericLimits.similarityThreshold.min,
          numericLimits.similarityThreshold.max,
        ),
      },
      context: {
        tokenBudget: clamp(
          450,
          numericLimits.contextBudget.min,
          numericLimits.contextBudget.max,
        ),
        historyBudget: clamp(
          400,
          numericLimits.historyBudget.min,
          numericLimits.historyBudget.max,
        ),
        clipTokens: clamp(
          64,
          numericLimits.clipTokens.min,
          numericLimits.clipTokens.max,
        ),
      },
      features: {
        reverseRAG: false,
        hyde: false,
        ranker: "none",
      },
      summaryLevel: "low",
    }),
    highRecall: buildPreset(basePreset, {
      rag: {
        enabled: true,
        topK: numericLimits.ragTopK.max,
        similarity: numericLimits.similarityThreshold.min,
      },
      context: {
        tokenBudget: numericLimits.contextBudget.max,
        historyBudget: numericLimits.historyBudget.max,
        clipTokens: numericLimits.clipTokens.max,
      },
      features: {
        reverseRAG: allowlist.allowReverseRAG,
        hyde: allowlist.allowHyde,
        ranker: defaultRanker,
      },
      summaryLevel: "high",
    }),
  };

  return {
    coreSystemPromptSummary:
      "Jack’s AI Assistant answers from the provided knowledge base, keeps replies concise, avoids action execution, and matches the visitor’s tone.",
    userSystemPromptDefault: DEFAULT_SYSTEM_PROMPT,
    userSystemPromptMaxLength: SYSTEM_PROMPT_MAX_LENGTH,
    numericLimits,
    allowlist,
    guardrails: {
      chitchatKeywords: guardrails.chitchatKeywords,
      fallbackChitchat: guardrails.fallbackChitchat,
      fallbackCommand: guardrails.fallbackCommand,
    },
    summaryPresets: buildSummaryPresets({
      summaryTriggerTokens: guardrails.numeric.summaryTriggerTokens,
      summaryMaxTurns: guardrails.numeric.summaryMaxTurns,
      summaryMaxChars: guardrails.numeric.summaryMaxChars,
    }),
    presets,
  };
}
