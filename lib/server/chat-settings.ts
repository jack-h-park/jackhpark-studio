import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_SYSTEM_PROMPT,
  normalizeSystemPrompt,
  SYSTEM_PROMPT_CACHE_TTL_MS,
} from "@/lib/chat-prompts";
import {
  resolveEmbeddingSpace,
  resolveLlmModel,
} from "@/lib/core/model-provider";
import {
  loadAdminChatConfig,
  type SummaryLevel,
} from "@/lib/server/admin-chat-config";
import {
  type ChatEngine,
  type ModelProvider,
  normalizeChatEngine,
} from "@/lib/shared/model-provider";
import {
  DEFAULT_HYDE_ENABLED,
  DEFAULT_RANKER_MODE,
  DEFAULT_REVERSE_RAG_ENABLED,
  DEFAULT_REVERSE_RAG_MODE,
  type RankerMode,
  type ReverseRagMode,
} from "@/lib/shared/rag-config";

const GUARDRAIL_SETTINGS_CACHE_TTL_MS = 60_000;
const CHAT_MODEL_SETTINGS_CACHE_TTL_MS = 60_000;
const LANGFUSE_SETTINGS_CACHE_TTL_MS = 60_000;

export type GuardrailNumericSettings = {
  similarityThreshold: number;
  ragTopK: number;
  ragContextTokenBudget: number;
  ragContextClipTokens: number;
  historyTokenBudget: number;
  summaryEnabled: boolean;
  summaryTriggerTokens: number;
  summaryMaxTurns: number;
  summaryMaxChars: number;
};

export type GuardrailDefaults = {
  chitchatKeywords: string[];
  fallbackChitchat: string;
  fallbackCommand: string;
  numeric: GuardrailNumericSettings;
};

export type ChatModelSettings = {
  engine: ChatEngine;
  llmModelId: string;
  embeddingModelId: string;
  embeddingSpaceId: string;
  llmProvider: ModelProvider;
  embeddingProvider: ModelProvider;
  llmModel: string;
  embeddingModel: string;
  reverseRagEnabled: boolean;
  reverseRagMode: ReverseRagMode;
  hydeEnabled: boolean;
  rankerMode: RankerMode;
  isDefault: {
    engine: boolean;
    llmProvider: boolean;
    embeddingProvider: boolean;
    llmModel: boolean;
    embeddingModel: boolean;
    reverseRagEnabled: boolean;
    reverseRagMode: boolean;
    hydeEnabled: boolean;
    rankerMode: boolean;
    embeddingSpaceId: boolean;
  };
};

export type LangfuseSettings = {
  envTag: string;
  sampleRateDev: number;
  sampleRatePreview: number;
  attachProviderMetadata: boolean;
  isDefault: {
    envTag: boolean;
    sampleRateDev: boolean;
    sampleRatePreview: boolean;
    attachProviderMetadata: boolean;
  };
};

export type SystemPromptResult = {
  prompt: string;
  isDefault: boolean;
};

export type GuardrailSettingsResult = GuardrailDefaults & {
  isDefault: {
    chitchatKeywords: boolean;
    fallbackChitchat: boolean;
    fallbackCommand: boolean;
    numeric: {
      [K in keyof GuardrailNumericSettings]: boolean;
    };
  };
};

const DEFAULT_CHITCHAT_KEYWORDS = parseKeywordList(
  process.env.CHAT_CHITCHAT_KEYWORDS ??
    "hello,hi,how are you,whats up,what is up,tell me a joke,thank you,thanks,lol,haha,good morning,good evening",
);

const DEFAULT_CHITCHAT_FALLBACK = normalizeGuardrailText(
  process.env.CHAT_FALLBACK_CHITCHAT_CONTEXT ??
    "This is a light-weight chit-chat turn. Keep the response concise, warm, and avoid citing the knowledge base.",
);

const DEFAULT_COMMAND_FALLBACK = normalizeGuardrailText(
  process.env.CHAT_FALLBACK_COMMAND_CONTEXT ??
    "The user is asking for an action/command. You must politely decline to execute actions and instead explain what is possible.",
);

const DEFAULT_SIMILARITY_THRESHOLD = clampNumber(
  Number(process.env.RAG_SIMILARITY_THRESHOLD ?? 0.78),
  0,
  1,
);
const DEFAULT_RAG_TOP_K = ensureMin(Number(process.env.RAG_TOP_K ?? 5), 1);
const DEFAULT_CONTEXT_TOKEN_BUDGET = ensureMin(
  Number(process.env.CHAT_CONTEXT_TOKEN_BUDGET ?? 1200),
  200,
);
const DEFAULT_CONTEXT_CLIP_TOKENS = ensureMin(
  Number(process.env.CHAT_CONTEXT_CLIP_TOKENS ?? 320),
  64,
);
const DEFAULT_HISTORY_TOKEN_BUDGET = ensureMin(
  Number(process.env.CHAT_HISTORY_TOKEN_BUDGET ?? 900),
  200,
);
const DEFAULT_SUMMARY_ENABLED =
  (process.env.CHAT_SUMMARY_ENABLED ?? "true").toLowerCase() !== "false";
const DEFAULT_SUMMARY_TRIGGER_TOKENS = ensureMin(
  Number(process.env.CHAT_SUMMARY_TRIGGER_TOKENS ?? 400),
  200,
);
const DEFAULT_SUMMARY_MAX_TURNS = ensureMin(
  Number(process.env.CHAT_SUMMARY_MAX_TURNS ?? 6),
  2,
);
const DEFAULT_SUMMARY_MAX_CHARS = ensureMin(
  Number(process.env.CHAT_SUMMARY_MAX_CHARS ?? 600),
  200,
);

const DEFAULT_NUMERIC_SETTINGS: GuardrailNumericSettings = {
  similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
  ragTopK: DEFAULT_RAG_TOP_K,
  ragContextTokenBudget: DEFAULT_CONTEXT_TOKEN_BUDGET,
  ragContextClipTokens: DEFAULT_CONTEXT_CLIP_TOKENS,
  historyTokenBudget: DEFAULT_HISTORY_TOKEN_BUDGET,
  summaryEnabled: DEFAULT_SUMMARY_ENABLED,
  summaryTriggerTokens: DEFAULT_SUMMARY_TRIGGER_TOKENS,
  summaryMaxTurns: DEFAULT_SUMMARY_MAX_TURNS,
  summaryMaxChars: DEFAULT_SUMMARY_MAX_CHARS,
};

const GUARDRAIL_DEFAULTS: GuardrailDefaults = {
  chitchatKeywords: DEFAULT_CHITCHAT_KEYWORDS,
  fallbackChitchat: DEFAULT_CHITCHAT_FALLBACK,
  fallbackCommand: DEFAULT_COMMAND_FALLBACK,
  numeric: { ...DEFAULT_NUMERIC_SETTINGS },
};

const DEFAULT_LANGFUSE_ENV_TAG =
  process.env.LANGFUSE_ENV_TAG ??
  process.env.APP_ENV ??
  process.env.NODE_ENV ??
  "dev";
const DEFAULT_LANGFUSE_SAMPLE_RATE_DEV = clampSampleRate(
  process.env.LANGFUSE_SAMPLE_RATE_DEV,
  0.3,
);
const DEFAULT_LANGFUSE_SAMPLE_RATE_PREVIEW = clampSampleRate(
  process.env.LANGFUSE_SAMPLE_RATE_PREVIEW,
  1,
);
const DEFAULT_LANGFUSE_ATTACH_PROVIDER_METADATA =
  (process.env.LANGFUSE_ATTACH_PROVIDER_METADATA ?? "true").toLowerCase() !==
  "false";

const DEFAULT_LANGFUSE_SETTINGS = {
  envTag: DEFAULT_LANGFUSE_ENV_TAG,
  sampleRateDev: DEFAULT_LANGFUSE_SAMPLE_RATE_DEV,
  sampleRatePreview: DEFAULT_LANGFUSE_SAMPLE_RATE_PREVIEW,
  attachProviderMetadata: DEFAULT_LANGFUSE_ATTACH_PROVIDER_METADATA,
} as const;

let cachedPrompt: SystemPromptResult | null = null;
let cachedPromptAt = 0;
let cachedGuardrails: GuardrailSettingsResult | null = null;
let cachedGuardrailsAt = 0;
let cachedChatModelSettings: ChatModelSettings | null = null;
let cachedChatModelSettingsAt = 0;
let cachedLangfuseSettings: LangfuseSettings | null = null;
let cachedLangfuseSettingsAt = 0;

function getDefaultEngine(): ChatEngine {
  return normalizeChatEngine(process.env.CHAT_ENGINE, "lc");
}

export function getChatModelDefaults(): ChatModelSettings {
  const engine = getDefaultEngine();
  const defaultLlm = resolveLlmModel();
  const defaultEmbedding = resolveEmbeddingSpace();

  return {
    engine,
    llmModelId: defaultLlm.id,
    embeddingModelId: defaultEmbedding.embeddingModelId,
    embeddingSpaceId: defaultEmbedding.embeddingSpaceId,
    llmProvider: defaultLlm.provider,
    embeddingProvider: defaultEmbedding.provider,
    llmModel: defaultLlm.model,
    embeddingModel: defaultEmbedding.model,
    reverseRagEnabled: DEFAULT_REVERSE_RAG_ENABLED,
    reverseRagMode: DEFAULT_REVERSE_RAG_MODE,
    hydeEnabled: DEFAULT_HYDE_ENABLED,
    rankerMode: DEFAULT_RANKER_MODE,
    isDefault: {
      engine: true,
      llmProvider: true,
      embeddingProvider: true,
      llmModel: true,
      embeddingModel: true,
      reverseRagEnabled: true,
      reverseRagMode: true,
      hydeEnabled: true,
      rankerMode: true,
      embeddingSpaceId: true,
    },
  };
}

export function getGuardrailDefaults(): GuardrailDefaults {
  return {
    chitchatKeywords: [...GUARDRAIL_DEFAULTS.chitchatKeywords],
    fallbackChitchat: GUARDRAIL_DEFAULTS.fallbackChitchat,
    fallbackCommand: GUARDRAIL_DEFAULTS.fallbackCommand,
    numeric: { ...GUARDRAIL_DEFAULTS.numeric },
  };
}

export function getLangfuseDefaults(): LangfuseSettings {
  return {
    envTag: DEFAULT_LANGFUSE_SETTINGS.envTag,
    sampleRateDev: DEFAULT_LANGFUSE_SETTINGS.sampleRateDev,
    sampleRatePreview: DEFAULT_LANGFUSE_SETTINGS.sampleRatePreview,
    attachProviderMetadata: DEFAULT_LANGFUSE_SETTINGS.attachProviderMetadata,
    isDefault: {
      envTag: true,
      sampleRateDev: true,
      sampleRatePreview: true,
      attachProviderMetadata: true,
    },
  };
}

export async function loadSystemPrompt(options?: {
  forceRefresh?: boolean;
  client?: SupabaseClient;
}): Promise<SystemPromptResult> {
  const shouldUseCache =
    !options?.forceRefresh &&
    cachedPrompt &&
    Date.now() - cachedPromptAt < SYSTEM_PROMPT_CACHE_TTL_MS;

  if (shouldUseCache && cachedPrompt) {
    return cachedPrompt;
  }

  const config = await loadAdminChatConfig({
    client: options?.client,
    forceRefresh: options?.forceRefresh,
  });

  const presetPrompt =
    config.presets?.default?.userSystemPrompt?.trim() ?? "";
  const userDefault = config.userSystemPromptDefault?.trim() ?? "";
  const rawPrompt =
    presetPrompt || userDefault || normalizeSystemPrompt(DEFAULT_SYSTEM_PROMPT);
  const prompt = normalizeSystemPrompt(rawPrompt);
  const isDefault = !presetPrompt && !userDefault;

  const result: SystemPromptResult = { prompt, isDefault };
  cachedPrompt = result;
  cachedPromptAt = Date.now();
  return result;
}

export async function loadChatModelSettings(options?: {
  forceRefresh?: boolean;
  client?: SupabaseClient;
}): Promise<ChatModelSettings> {
  const shouldUseCache =
    !options?.forceRefresh &&
    cachedChatModelSettings &&
    Date.now() - cachedChatModelSettingsAt < CHAT_MODEL_SETTINGS_CACHE_TTL_MS;

  if (shouldUseCache && cachedChatModelSettings) {
    return cachedChatModelSettings;
  }

  const config = await loadAdminChatConfig({
    client: options?.client,
    forceRefresh: options?.forceRefresh,
  });
  const defaults = getChatModelDefaults();
  const preset = config.presets?.default;

  const engine = normalizeChatEngine(
    preset?.chatEngine ?? defaults.engine,
    defaults.engine,
  );

  const llmSelection = resolveLlmModel({
    modelId: preset?.llmModel ?? defaults.llmModelId,
    model: preset?.llmModel ?? defaults.llmModel,
  });

  const embeddingSelection = resolveEmbeddingSpace({
    embeddingModelId: preset?.embeddingModel ?? defaults.embeddingModelId,
    embeddingSpaceId: defaults.embeddingSpaceId,
    model: preset?.embeddingModel ?? defaults.embeddingModel,
  });

  const reverseRagEnabled =
    preset?.features.reverseRAG ?? DEFAULT_REVERSE_RAG_ENABLED;
  const reverseRagMode = DEFAULT_REVERSE_RAG_MODE;
  const hydeEnabled = preset?.features.hyde ?? DEFAULT_HYDE_ENABLED;
  const rankerMode = preset?.features.ranker ?? DEFAULT_RANKER_MODE;

  const result: ChatModelSettings = {
    engine,
    llmModelId: llmSelection.id,
    embeddingModelId: embeddingSelection.embeddingModelId,
    embeddingSpaceId: embeddingSelection.embeddingSpaceId,
    llmProvider: llmSelection.provider,
    embeddingProvider: embeddingSelection.provider,
    llmModel: llmSelection.model,
    embeddingModel: embeddingSelection.model,
    reverseRagEnabled,
    reverseRagMode,
    hydeEnabled,
    rankerMode,
    isDefault: {
      engine: engine === defaults.engine,
      llmProvider: llmSelection.provider === defaults.llmProvider,
      embeddingProvider:
        embeddingSelection.provider === defaults.embeddingProvider,
      llmModel: llmSelection.id === defaults.llmModelId,
      embeddingModel:
        embeddingSelection.embeddingModelId === defaults.embeddingModelId,
      reverseRagEnabled:
        reverseRagEnabled === DEFAULT_REVERSE_RAG_ENABLED &&
        reverseRagEnabled === defaults.reverseRagEnabled,
      reverseRagMode:
        reverseRagMode === DEFAULT_REVERSE_RAG_MODE &&
        reverseRagMode === defaults.reverseRagMode,
      hydeEnabled: hydeEnabled === DEFAULT_HYDE_ENABLED,
      rankerMode: rankerMode === DEFAULT_RANKER_MODE,
      embeddingSpaceId:
        embeddingSelection.embeddingSpaceId === defaults.embeddingSpaceId,
    },
  };

  cachedChatModelSettings = result;
  cachedChatModelSettingsAt = Date.now();
  return result;
}

export async function loadGuardrailSettings(options?: {
  forceRefresh?: boolean;
  client?: SupabaseClient;
}): Promise<GuardrailSettingsResult> {
  const shouldUseCache =
    !options?.forceRefresh &&
    cachedGuardrails &&
    Date.now() - cachedGuardrailsAt < GUARDRAIL_SETTINGS_CACHE_TTL_MS;

  if (shouldUseCache && cachedGuardrails) {
    return cachedGuardrails;
  }

  const config = await loadAdminChatConfig({
    client: options?.client,
    forceRefresh: options?.forceRefresh,
  });
  const defaults = getGuardrailDefaults();
  const numericLimits = config.numericLimits;

  const numeric: GuardrailNumericSettings = {
    similarityThreshold:
      numericLimits?.similarityThreshold?.default ??
      defaults.numeric.similarityThreshold,
    ragTopK:
      numericLimits?.ragTopK?.default ?? defaults.numeric.ragTopK,
    ragContextTokenBudget:
      numericLimits?.contextBudget?.default ??
      defaults.numeric.ragContextTokenBudget,
    ragContextClipTokens:
      numericLimits?.clipTokens?.default ??
      defaults.numeric.ragContextClipTokens,
    historyTokenBudget:
      numericLimits?.historyBudget?.default ??
      defaults.numeric.historyTokenBudget,
    summaryEnabled: defaults.numeric.summaryEnabled,
    summaryTriggerTokens: defaults.numeric.summaryTriggerTokens,
    summaryMaxTurns: defaults.numeric.summaryMaxTurns,
    summaryMaxChars: defaults.numeric.summaryMaxChars,
  };

  const summaryLevel: SummaryLevel =
    config.presets?.default?.summaryLevel ?? "off";
  const summaryPreset =
    summaryLevel !== "off" ? config.summaryPresets?.[summaryLevel] : null;
  numeric.summaryEnabled = summaryLevel !== "off";
  numeric.summaryMaxTurns =
    summaryPreset?.every_n_turns ?? defaults.numeric.summaryMaxTurns;

  const keywords = config.guardrails?.chitchatKeywords?.length
    ? parseKeywordList(config.guardrails.chitchatKeywords)
    : undefined;
  const fallbackChitchat = normalizeGuardrailText(
    config.guardrails?.fallbackChitchat,
  );
  const fallbackCommand = normalizeGuardrailText(
    config.guardrails?.fallbackCommand,
  );

  const result: GuardrailSettingsResult = {
    chitchatKeywords: keywords?.length ? keywords : defaults.chitchatKeywords,
    fallbackChitchat:
      fallbackChitchat || defaults.fallbackChitchat,
    fallbackCommand: fallbackCommand || defaults.fallbackCommand,
    numeric,
    isDefault: {
      chitchatKeywords: !keywords,
      fallbackChitchat: !fallbackChitchat,
      fallbackCommand: !fallbackCommand,
      numeric: buildNumericDefaultsFlags(numeric, defaults.numeric),
    },
  };

  cachedGuardrails = result;
  cachedGuardrailsAt = Date.now();
  return result;
}

export async function loadLangfuseSettings(options?: {
  forceRefresh?: boolean;
  client?: SupabaseClient;
}): Promise<LangfuseSettings> {
  const shouldUseCache =
    !options?.forceRefresh &&
    cachedLangfuseSettings &&
    Date.now() - cachedLangfuseSettingsAt < LANGFUSE_SETTINGS_CACHE_TTL_MS;

  if (shouldUseCache && cachedLangfuseSettings) {
    return cachedLangfuseSettings;
  }

  const result = getLangfuseDefaults();
  cachedLangfuseSettings = result;
  cachedLangfuseSettingsAt = Date.now();
  return result;
}

function buildNumericDefaultsFlags(
  numeric: GuardrailNumericSettings,
  defaults: GuardrailNumericSettings,
): { [K in keyof GuardrailNumericSettings]: boolean } {
  return {
    similarityThreshold:
      numeric.similarityThreshold === defaults.similarityThreshold,
    ragTopK: numeric.ragTopK === defaults.ragTopK,
    ragContextTokenBudget:
      numeric.ragContextTokenBudget === defaults.ragContextTokenBudget,
    ragContextClipTokens:
      numeric.ragContextClipTokens === defaults.ragContextClipTokens,
    historyTokenBudget:
      numeric.historyTokenBudget === defaults.historyTokenBudget,
    summaryEnabled: numeric.summaryEnabled === defaults.summaryEnabled,
    summaryTriggerTokens:
      numeric.summaryTriggerTokens === defaults.summaryTriggerTokens,
    summaryMaxTurns: numeric.summaryMaxTurns === defaults.summaryMaxTurns,
    summaryMaxChars: numeric.summaryMaxChars === defaults.summaryMaxChars,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function ensureMin(value: number, min: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, value);
}

function clampSampleRate(
  candidate: string | number | undefined,
  fallback: number,
): number {
  if (candidate === undefined || candidate === null) {
    return fallback;
  }
  const parsed = typeof candidate === "number" ? candidate : Number(candidate);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function parseKeywordList(
  value: string | string[] | null | undefined,
): string[] {
  if (!value) {
    return [];
  }

  const entries = Array.isArray(value) ? value : value.split(/\r?\n|,/);
  const normalized = entries
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalized));
}

function normalizeGuardrailText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value.replaceAll("\r\n", "\n").trim();
}
