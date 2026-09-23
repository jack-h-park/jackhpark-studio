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
import { startDbQuery } from "@/lib/logging/db-logger";
import {
  type AdminChatConfig,
  type AdminReasoningEffort,
  type RagAutoMode,
  type RagMultiQueryMode,
} from "@/types/chat-config";

export const ADMIN_CHAT_CONFIG_KEY = "admin_chat_config";
const DEFAULT_ADMIN_CHAT_CONFIG: Pick<
  AdminChatConfig,
  "telemetry" | "cache" | "generation"
> = {
  telemetry: {
    sampleRate: 1,
    detailLevel: "standard",
  },
  cache: {
    responseTtlSeconds: 300,
    retrievalTtlSeconds: 60,
  },
  generation: {
    reasoningEffort: "provider-default",
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
  enabled: boolean;
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
  // Per-preset override for generation.reasoningEffort. Undefined means "inherit
  // the global setting" — which is what every preset does until someone sets one,
  // so existing config rows keep their current behavior untouched.
  // Resolve with resolveReasoningEffort(); never read this field directly.
  reasoningEffort?: AdminReasoningEffort;
  embeddingModel: EmbeddingModelId;
  rag: RagPreset;
  context: ContextPreset;
  features: FeatureFlagsPreset;
  summaryLevel: SummaryLevel;
  safeMode?: boolean;
  requireLocal?: boolean;
  showTelemetry: boolean;
  showCitations: boolean;
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

// MERGE BASE ONLY — editing these values does not change a running deployment.
//
// The effective presets are the `admin_chat_config` row in the Supabase
// `system_settings` table; these constants are only what that row is merged
// *onto* (see parseAdminChatConfig below). The merge is per preset key, not per
// field: a preset the DB row defines replaces the default for that preset
// whole, so a model changed here is silently discarded for every preset the row
// already carries — the PR merges, the deploy is green, and nothing changes.
//
// Symptom to recognize: the admin dashboard shows a model these constants do
// not name. That difference is the DB row, working as designed.
//
// To change a preset for real, use the admin dashboard (Chat Config → Session
// presets), which upserts that row. Change the values here only to move the
// fallback for deployments with no row yet, or for a preset key the row omits.
//
// See docs/chat/session-presets.md § Where Preset Values Actually Come From.
export const DEFAULT_ADMIN_CHAT_PRESETS: AdminChatPresetsConfig = {
  default: {
    additionalSystemPrompt: CONCISE_PROMPT,
    llmModel: "gpt-6-luna",
    embeddingModel: FALLBACK_MINIMAL_EMBEDDING_MODEL,
    rag: {
      enabled: true,
      topK: 6,
      similarity: 0.4,
    },
    context: {
      enabled: true,
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
    showTelemetry: false,
    showCitations: false,
  },
  fast: {
    additionalSystemPrompt: SPEED_PROMPT,
    llmModel: "gpt-6-luna",
    embeddingModel: FALLBACK_MINIMAL_EMBEDDING_MODEL,
    rag: {
      enabled: true,
      topK: 4,
      similarity: 0.35,
    },
    context: {
      enabled: true,
      tokenBudget: 1536,
      historyBudget: 512,
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
    showTelemetry: false,
    showCitations: false,
  },
  highRecall: {
    additionalSystemPrompt: COMPLETE_PROMPT,
    llmModel: "gpt-6-luna",
    embeddingModel: FALLBACK_MINIMAL_EMBEDDING_MODEL,
    rag: {
      enabled: true,
      topK: 12,
      similarity: 0.3,
    },
    context: {
      enabled: true,
      tokenBudget: 3072,
      historyBudget: 1536,
      clipTokens: 512,
    },
    features: {
      reverseRAG: true,
      hyde: false,
      ranker: "mmr",
    },
    summaryLevel: "high",
    safeMode: false,
    requireLocal: false,
    showTelemetry: false,
    showCitations: false,
  },
  precision: {
    additionalSystemPrompt: CONCISE_PROMPT,
    llmModel: "gpt-6-luna",
    embeddingModel: FALLBACK_MINIMAL_EMBEDDING_MODEL,
    rag: {
      enabled: true,
      topK: 4,
      similarity: 0.5,
    },
    context: {
      enabled: true,
      tokenBudget: 2048,
      historyBudget: 1024,
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
    showTelemetry: false,
    showCitations: false,
  },
};

const REASONING_EFFORTS: readonly AdminReasoningEffort[] = [
  "provider-default",
  "none",
  "low",
  "medium",
  "high",
];

function normalizeReasoningEffort(
  value: unknown,
): AdminReasoningEffort | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return REASONING_EFFORTS.find((effort) => effort === normalized);
}

/**
 * Resolve the reasoning effort that should actually be sent to the provider for
 * one preset.
 *
 * Precedence: preset override -> global generation setting -> provider default.
 *
 * Returns `undefined` for "provider-default", because that is how the provider
 * factory spells "send no reasoning parameter at all" — an explicit
 * "provider-default" string would be an invalid effort value on the wire.
 *
 * Callers must not read `preset.reasoningEffort` directly; an unset override is
 * inheritance, not "none", and the two behave very differently on a reasoning
 * model.
 */
export function resolveReasoningEffort(
  config: Pick<AdminChatConfig, "generation" | "presets">,
  presetId: string | null | undefined,
): Exclude<AdminReasoningEffort, "provider-default"> | undefined {
  const presetOverride = presetId
    ? normalizeReasoningEffort(config.presets?.[presetId]?.reasoningEffort)
    : undefined;
  const effort =
    presetOverride ??
    normalizeReasoningEffort(config.generation?.reasoningEffort) ??
    "provider-default";
  return effort === "provider-default" ? undefined : effort;
}

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
  const tracker = startDbQuery({
    action: "fetchAdminChatConfigRow",
    table: SYSTEM_SETTINGS_TABLE,
    operation: "select",
    correlationId: ADMIN_CHAT_CONFIG_KEY,
  });
  const { data, error } = await client
    .from(SYSTEM_SETTINGS_TABLE)
    .select("value, updated_at")
    .eq("key", ADMIN_CHAT_CONFIG_KEY)
    .maybeSingle();

  if (error) {
    tracker.error(error);
    throw new Error(
      `[admin-chat-config] failed to load admin_chat_config: ${error.message}`,
    );
  }

  tracker.done({ rowCount: data ? 1 : 0 });

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
    generation: {
      ...DEFAULT_ADMIN_CHAT_CONFIG.generation,
      ...(config as AdminChatConfig).generation,
      reasoningEffort:
        (config as AdminChatConfig).generation?.reasoningEffort ??
        "provider-default",
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

  const finalPresets: AdminChatPresetsConfig = Object.fromEntries(
    Object.entries({
      ...mergedPresets,
      "local-required": localRequiredPreset,
    }).map(([key, preset]) => [
      key,
      // Drop an unrecognized stored effort rather than passing it through to the
      // provider. Undefined means "inherit the global setting", which is the
      // right thing to fall back to for a value we cannot interpret.
      preset.reasoningEffort === undefined
        ? preset
        : {
            ...preset,
            reasoningEffort: normalizeReasoningEffort(preset.reasoningEffort),
          },
    ]),
  ) as AdminChatPresetsConfig;

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
  const tracker = startDbQuery({
    action: "saveAdminChatConfig",
    table: SYSTEM_SETTINGS_TABLE,
    operation: "upsert",
    correlationId: ADMIN_CHAT_CONFIG_KEY,
  });
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
    tracker.error(error);
    throw new Error(
      `[admin-chat-config] failed to save admin_chat_config: ${error.message}`,
    );
  }

  tracker.done({ rowCount: data ? 1 : 0 });

  cachedAdminChatConfig = sanitized;
  cachedUpdatedAt = data?.updated_at ?? null;

  return { updatedAt: cachedUpdatedAt };
}
