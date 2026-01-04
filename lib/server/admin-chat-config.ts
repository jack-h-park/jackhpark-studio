import type { SupabaseClient } from "@supabase/supabase-js";

import type { DocType, PersonaType } from "@/lib/rag/metadata";
import type {
  EmbeddingModelId,
  LlmModelId,
  RankerId,
} from "@/lib/shared/models";
import { SYSTEM_SETTINGS_TABLE } from "@/lib/chat-prompts";
import { DEFAULT_EMBEDDING_MODEL_ID } from "@/lib/core/embedding-spaces";
import { supabaseClient } from "@/lib/core/supabase";
import {
  type AdminChatConfig,
  DEFAULT_ADDITIONAL_PROMPT_MAX_LENGTH,
  type RagAutoMode,
  type RagMultiQueryMode,
} from "@/types/chat-config";

export const ADMIN_CHAT_CONFIG_KEY = "admin_chat_config";
const DEFAULT_ADMIN_CHAT_CONFIG: Pick<AdminChatConfig, "telemetry" | "cache"> =
  {
    telemetry: {
      sampleRate: 1,
      detailLevel: "standard",
    },
    cache: {
      responseTtlSeconds: 300,
      retrievalTtlSeconds: 60,
    },
  };

// NOTE:
// The system_settings table is expected to contain exactly one row for chat configuration:
// key = "admin_chat_config", value = AdminChatConfig JSON.
// All legacy per-key settings (system_prompt, chat_*, guardrail_*, langfuse_*) have been removed.

export type NumericLimit = {
  min: number;
  max: number;
  default: number;
};

export type NumericLimitsConfig = {
  ragTopK: NumericLimit;
  similarityThreshold: NumericLimit;
  contextBudget: NumericLimit;
  historyBudget: NumericLimit;
  clipTokens: NumericLimit;
};

export type AllowlistConfig = {
  llmModels: LlmModelId[];
  embeddingModels: EmbeddingModelId[];
  rankers: RankerId[];
  allowReverseRAG: boolean;
  allowHyde: boolean;
};

export type GuardrailConfig = {
  chitchatKeywords: string[];
  fallbackChitchat: string;
  fallbackCommand: string;
};

export type SummaryPreset = {
  every_n_turns: number;
};

export type SummaryPresetsConfig = {
  low: SummaryPreset;
  medium: SummaryPreset;
  high: SummaryPreset;
};

export type RagPreset = {
  enabled: boolean;
  topK: number;
  similarity: number;
};

export type ContextPreset = {
  tokenBudget: number;
  historyBudget: number;
  clipTokens: number;
};

export type FeatureFlagsPreset = {
  reverseRAG: boolean;
  hyde: boolean;
  ranker: RankerId;
};

export type SummaryLevel = "off" | "low" | "medium" | "high";

export type AdminChatPreset = {
  additionalSystemPrompt?: string;
  llmModel: LlmModelId;
  embeddingModel: EmbeddingModelId;
  rag: RagPreset;
  context: ContextPreset;
  features: FeatureFlagsPreset;
  summaryLevel: SummaryLevel;
  safeMode?: boolean;
  requireLocal?: boolean;
};

export type AdminChatPresetsConfig = Record<string, AdminChatPreset> & {
  default: AdminChatPreset;
  fast: AdminChatPreset;
  highRecall: AdminChatPreset;
  precision: AdminChatPreset;
};

const FALLBACK_MINIMAL_EMBEDDING_MODEL =
  DEFAULT_EMBEDDING_MODEL_ID || "text-embedding-3-small";

const CONCISE_PROMPT =
  "Answer concisely and accurately. Avoid speculation. Use retrieved context only when it clearly improves correctness.";
const COMPLETE_PROMPT =
  "Prioritize completeness and coverage. It is acceptable to include multiple perspectives or partially relevant context if it improves recall.";
const SPEED_PROMPT =
  "Focus on speed and brevity. Prefer short, direct answers. Avoid unnecessary explanations or deep reasoning.";

export const DEFAULT_ADMIN_CHAT_PRESETS: AdminChatPresetsConfig = {
  default: {
    additionalSystemPrompt: CONCISE_PROMPT,
    llmModel: "gpt-4o",
    embeddingModel: FALLBACK_MINIMAL_EMBEDDING_MODEL,
    rag: {
      enabled: true,
      topK: 6,
      similarity: 0.4,
    },
    context: {
      tokenBudget: 2048,
      historyBudget: 1024,
      clipTokens: 128,
    },
    features: {
      reverseRAG: false,
      hyde: false,
      ranker: "none",
    },
    summaryLevel: "low",
    safeMode: false,
    requireLocal: false,
  },
  fast: {
    additionalSystemPrompt: SPEED_PROMPT,
    llmModel: "gpt-4o-mini",
    embeddingModel: FALLBACK_MINIMAL_EMBEDDING_MODEL,
    rag: {
      enabled: true,
      topK: 3,
      similarity: 0.35,
    },
    context: {
      tokenBudget: 1536,
      historyBudget: 512,
      clipTokens: 64,
    },
    features: {
      reverseRAG: false,
      hyde: false,
      ranker: "none",
    },
    summaryLevel: "low",
    safeMode: false,
    requireLocal: false,
  },
  highRecall: {
    additionalSystemPrompt: COMPLETE_PROMPT,
    llmModel: "gpt-4o",
    embeddingModel: FALLBACK_MINIMAL_EMBEDDING_MODEL,
    rag: {
      enabled: true,
      topK: 12,
      similarity: 0.3,
    },
    context: {
      tokenBudget: 3072,
      historyBudget: 1536,
      clipTokens: 256,
    },
    features: {
      reverseRAG: true,
      hyde: false,
      ranker: "mmr",
    },
    summaryLevel: "medium",
    safeMode: false,
    requireLocal: false,
  },
  precision: {
    additionalSystemPrompt: CONCISE_PROMPT,
    llmModel: "gpt-4o",
    embeddingModel: FALLBACK_MINIMAL_EMBEDDING_MODEL,
    rag: {
      enabled: true,
      topK: 4,
      similarity: 0.55,
    },
    context: {
      tokenBudget: 2048,
      historyBudget: 768,
      clipTokens: 128,
    },
    features: {
      reverseRAG: false,
      hyde: false,
      ranker: "none",
    },
    summaryLevel: "off",
    safeMode: false,
    requireLocal: false,
  },
};

export type RagRankingConfig = {
  docTypeWeights: Partial<Record<DocType, number>>;
  personaTypeWeights: Partial<Record<PersonaType, number>>;
};

const DEFAULT_HYDE_MODE: RagAutoMode = "off";
const DEFAULT_REWRITE_MODE: RagAutoMode = "off";
const DEFAULT_MULTI_QUERY_MODE: RagMultiQueryMode = "off";
const DEFAULT_MULTI_QUERY_MAX = 2;

function normalizeRagAutoMode(
  value: unknown,
  fallback: RagAutoMode,
): RagAutoMode {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "off") return "off";
  if (normalized === "on") return "on";
  if (normalized === "auto") return "auto";
  return fallback;
}

function normalizeMultiQueryMode(
  value: unknown,
  fallback: RagMultiQueryMode,
): RagMultiQueryMode {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "off") return "off";
  if (normalized === "auto") return "auto";
  return fallback;
}

function normalizeMultiQueryMax(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return value >= 2 ? 2 : 1;
}

type AdminChatConfigRow = {
  value: unknown;
  updated_at: string | null;
};

let cachedAdminChatConfig: AdminChatConfig | null = null;
let cachedUpdatedAt: string | null = null;

async function fetchAdminChatConfigRow(
  client: SupabaseClient,
): Promise<AdminChatConfigRow | null> {
  const { data, error } = await client
    .from(SYSTEM_SETTINGS_TABLE)
    .select("value, updated_at")
    .eq("key", ADMIN_CHAT_CONFIG_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[admin-chat-config] failed to load admin_chat_config: ${error.message}`,
    );
  }

  return data ?? null;
}

function parseAdminChatConfig(value: unknown): AdminChatConfig {
  let rawValue = value;
  if (typeof rawValue === "string") {
    try {
      rawValue = JSON.parse(rawValue);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to parse JSON value.";
      throw new Error(
        `[admin-chat-config] admin_chat_config JSON is invalid: ${message}`,
      );
    }
  }

  if (!rawValue || typeof rawValue !== "object") {
    throw new Error(
      "[admin-chat-config] admin_chat_config value is not a JSON object.",
    );
  }

  const config = rawValue as AdminChatConfig;
  const mergedConfig: AdminChatConfig = {
    ...DEFAULT_ADMIN_CHAT_CONFIG,
    ...config,
    telemetry: {
      ...DEFAULT_ADMIN_CHAT_CONFIG.telemetry,
      ...(config as AdminChatConfig).telemetry,
    },
    cache: {
      ...DEFAULT_ADMIN_CHAT_CONFIG.cache,
      ...(config as AdminChatConfig).cache,
    },
  };

  if (
    !mergedConfig.numericLimits ||
    !mergedConfig.allowlist ||
    !mergedConfig.guardrails ||
    !mergedConfig.summaryPresets
  ) {
    throw new Error(
      "[admin-chat-config] admin_chat_config is missing required fields.",
    );
  }

  const configPresets: Partial<AdminChatPresetsConfig> =
    mergedConfig.presets ?? {};
  const mergedPresets: AdminChatPresetsConfig = {
    ...DEFAULT_ADMIN_CHAT_PRESETS,
    ...configPresets,
  } as AdminChatPresetsConfig;

  if (
    !mergedPresets.default ||
    !mergedPresets.fast ||
    !mergedPresets.highRecall
  ) {
    throw new Error(
      "[admin-chat-config] admin_chat_config.presets is missing required presets.",
    );
  }

  const localRequiredPreset: AdminChatPreset = mergedPresets[
    "local-required"
  ] ?? {
    ...mergedPresets.default,
    llmModel: "mistral-ollama",
    requireLocal: true,
  };

  const finalPresets: AdminChatPresetsConfig = {
    ...mergedPresets,
    "local-required": localRequiredPreset,
  };

  const additionalPromptMaxLength =
    typeof mergedConfig.additionalPromptMaxLength === "number"
      ? mergedConfig.additionalPromptMaxLength
      : DEFAULT_ADDITIONAL_PROMPT_MAX_LENGTH;
  const hydeMode = normalizeRagAutoMode(
    mergedConfig.hydeMode,
    DEFAULT_HYDE_MODE,
  );
  const rewriteMode = normalizeRagAutoMode(
    mergedConfig.rewriteMode,
    DEFAULT_REWRITE_MODE,
  );
  const ragMultiQueryMode = normalizeMultiQueryMode(
    mergedConfig.ragMultiQueryMode,
    DEFAULT_MULTI_QUERY_MODE,
  );
  const ragMultiQueryMaxQueries = normalizeMultiQueryMax(
    mergedConfig.ragMultiQueryMaxQueries,
    DEFAULT_MULTI_QUERY_MAX,
  );

  return {
    ...mergedConfig,
    baseSystemPromptSummary: mergedConfig.baseSystemPromptSummary ?? "",
    additionalPromptMaxLength,
    hydeMode,
    rewriteMode,
    ragMultiQueryMode,
    ragMultiQueryMaxQueries,
    presets: finalPresets,
  };
}

export async function loadAdminChatConfig(options?: {
  client?: SupabaseClient;
  forceRefresh?: boolean;
}): Promise<AdminChatConfig> {
  const forceRefresh = options?.forceRefresh ?? false;
  if (!forceRefresh && cachedAdminChatConfig) {
    return cachedAdminChatConfig;
  }

  const client = options?.client ?? supabaseClient;
  const row = await fetchAdminChatConfigRow(client);
  if (!row?.value) {
    throw new Error(
      "[admin-chat-config] admin_chat_config setting is missing in system_settings.",
    );
  }

  const config = parseAdminChatConfig(row.value);
  cachedAdminChatConfig = config;
  cachedUpdatedAt = row.updated_at ?? null;

  return config;
}

export async function getAdminChatConfig(options?: {
  client?: SupabaseClient;
  forceRefresh?: boolean;
}): Promise<AdminChatConfig> {
  return loadAdminChatConfig(options);
}

export async function getAdminChatConfigMetadata(options?: {
  client?: SupabaseClient;
  forceRefresh?: boolean;
}): Promise<{ updatedAt: string | null }> {
  if (!options?.forceRefresh && cachedUpdatedAt !== null) {
    return { updatedAt: cachedUpdatedAt };
  }

  const client = options?.client ?? supabaseClient;
  const row = await fetchAdminChatConfigRow(client);
  cachedUpdatedAt = row?.updated_at ?? cachedUpdatedAt ?? null;

  return { updatedAt: row?.updated_at ?? null };
}

export async function saveAdminChatConfig(
  config: AdminChatConfig,
  options?: { client?: SupabaseClient },
): Promise<{ updatedAt: string | null }> {
  const client = options?.client ?? supabaseClient;
  const sanitized = parseAdminChatConfig(config);
  const { data, error } = await client
    .from(SYSTEM_SETTINGS_TABLE)
    .upsert(
      {
        key: ADMIN_CHAT_CONFIG_KEY,
        value: JSON.stringify(sanitized),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    )
    .select("updated_at")
    .single();

  if (error) {
    throw new Error(
      `[admin-chat-config] failed to save admin_chat_config: ${error.message}`,
    );
  }

  cachedAdminChatConfig = sanitized;
  cachedUpdatedAt = data?.updated_at ?? null;

  return { updatedAt: cachedUpdatedAt };
}
