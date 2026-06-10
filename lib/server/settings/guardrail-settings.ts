import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadAdminChatConfig,
  type SummaryLevel,
} from "@/lib/server/admin-chat-config";

import { TtlCache } from "./ttl-cache";

const GUARDRAIL_SETTINGS_CACHE_TTL_MS = 60_000;

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

const guardrailsCache = new TtlCache<GuardrailSettingsResult>(
  GUARDRAIL_SETTINGS_CACHE_TTL_MS,
);

export function getGuardrailDefaults(): GuardrailDefaults {
  return {
    chitchatKeywords: [...GUARDRAIL_DEFAULTS.chitchatKeywords],
    fallbackChitchat: GUARDRAIL_DEFAULTS.fallbackChitchat,
    fallbackCommand: GUARDRAIL_DEFAULTS.fallbackCommand,
    numeric: { ...GUARDRAIL_DEFAULTS.numeric },
  };
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

export async function loadGuardrailSettings(options?: {
  forceRefresh?: boolean;
  client?: SupabaseClient;
}): Promise<GuardrailSettingsResult> {
  const cached = !options?.forceRefresh ? guardrailsCache.get() : null;
  if (cached) {
    return cached;
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
    ragTopK: numericLimits?.ragTopK?.default ?? defaults.numeric.ragTopK,
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
    fallbackChitchat: fallbackChitchat || defaults.fallbackChitchat,
    fallbackCommand: fallbackCommand || defaults.fallbackCommand,
    numeric,
    isDefault: {
      chitchatKeywords: !keywords,
      fallbackChitchat: !fallbackChitchat,
      fallbackCommand: !fallbackCommand,
      numeric: buildNumericDefaultsFlags(numeric, defaults.numeric),
    },
  };

  return guardrailsCache.set(result);
}
