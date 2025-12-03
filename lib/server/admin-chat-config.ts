import type { SupabaseClient } from "@supabase/supabase-js";

import type { DocType, PersonaType } from "@/lib/rag/metadata";
import type { ChatEngine } from "@/lib/shared/model-provider";
import type {
  EmbeddingModelId,
  LlmModelId,
  RankerId,
} from "@/lib/shared/models";
import { SYSTEM_SETTINGS_TABLE } from "@/lib/chat-prompts";
import { supabaseClient } from "@/lib/core/supabase";
import {
  type AdminChatConfig,
  DEFAULT_ADDITIONAL_PROMPT_MAX_LENGTH,
} from "@/types/chat-config";

export const ADMIN_CHAT_CONFIG_KEY = "admin_chat_config";
const DEFAULT_ADMIN_CHAT_CONFIG: Pick<
  AdminChatConfig,
  "telemetry" | "cache"
> = {
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
  chatEngines: ChatEngine[];
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
  chatEngine: ChatEngine;
  rag: RagPreset;
  context: ContextPreset;
  features: FeatureFlagsPreset;
  summaryLevel: SummaryLevel;
};

export type AdminChatPresetsConfig = {
  default: AdminChatPreset;
  fast: AdminChatPreset;
  highRecall: AdminChatPreset;
};

export type RagRankingConfig = {
  docTypeWeights: Partial<Record<DocType, number>>;
  personaTypeWeights: Partial<Record<PersonaType, number>>;
};

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
    !mergedConfig.summaryPresets ||
    !mergedConfig.presets
  ) {
    throw new Error(
      "[admin-chat-config] admin_chat_config is missing required fields.",
    );
  }

  if (
    !mergedConfig.presets.default ||
    !mergedConfig.presets.fast ||
    !mergedConfig.presets.highRecall
  ) {
    throw new Error(
      "[admin-chat-config] admin_chat_config.presets is missing required presets.",
    );
  }

  const localRequiredPreset: AdminChatPreset =
    mergedConfig.presets["local-required"] ??
    {
      ...mergedConfig.presets.default,
      llmModel: "mistral",
      chatEngine: "native",
      requireLocal: true,
    };

  const additionalPromptMaxLength =
    typeof mergedConfig.additionalPromptMaxLength === "number"
      ? mergedConfig.additionalPromptMaxLength
      : DEFAULT_ADDITIONAL_PROMPT_MAX_LENGTH;

  return {
    ...mergedConfig,
    baseSystemPromptSummary: mergedConfig.baseSystemPromptSummary ?? "",
    additionalPromptMaxLength,
    presets: {
      ...mergedConfig.presets,
      "local-required": localRequiredPreset,
    },
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
