import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_SYSTEM_PROMPT,
  normalizeSystemPrompt,
  SYSTEM_PROMPT_CACHE_TTL_MS,
} from "@/lib/chat-prompts";
import {
  DEFAULT_LLM_MODEL_ID,
  IS_DEFAULT_MODEL_EXPLICIT,
  normalizeLlmModelId,
} from "@/lib/core/llm-registry";
import { isLmStudioConfigured } from "@/lib/core/lmstudio";
import {
  resolveEmbeddingSpace,
  resolveLlmModel,
} from "@/lib/core/model-provider";
import { isOllamaConfigured } from "@/lib/core/ollama";
import { getLocalLlmBackend, getLocalLlmClient } from "@/lib/local-llm";
import { ragLogger } from "@/lib/logging/logger";
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
  type ModelResolutionReason,
  resolveLlmModelId,
} from "@/lib/shared/model-resolution";
import {
  DEFAULT_HYDE_ENABLED,
  DEFAULT_RANKER_MODE,
  DEFAULT_REVERSE_RAG_ENABLED,
  DEFAULT_REVERSE_RAG_MODE,
  type RankerMode,
  type ReverseRagMode,
} from "@/lib/shared/rag-config";
import {
  type AdminChatConfig,
  type ChatEngineType,
  getAdditionalPromptMaxLength,
  type SessionChatConfig,
} from "@/types/chat-config";

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

export type ChatRuntimeFallbackFrom = {
  type: "local";
  provider: ModelProvider;
  modelId: string;
};

export type ChatModelPolicy = {
  requireLocal: boolean;
};

export type ChatRuntimeEnforcement =
  | "local_ok"
  | "fallback_to_cloud"
  | "blocked_require_local"
  | "cloud_ok";

export type ChatModelSettings = {
  engine: ChatEngine;
  llmModelId: string;
  requestedLlmModelId: string;
  resolvedLlmModelId: string;
  llmModelWasSubstituted: boolean;
  llmSubstitutionReason?: ModelResolutionReason;
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
  llmEngine: ChatEngineType;
  policy: ChatModelPolicy;
  wantsLocalEngine: boolean;
  enforcement: ChatRuntimeEnforcement;
  localBackendAvailable: boolean;
  localLlmBackendEnv: string | null;
  isLocal: boolean;
  fallbackFrom?: ChatRuntimeFallbackFrom;
};

export type LangfuseSettings = {
  envTag: string;
  attachProviderMetadata: boolean;
  isDefault: {
    envTag: boolean;
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
const DEFAULT_LANGFUSE_ATTACH_PROVIDER_METADATA =
  (process.env.LANGFUSE_ATTACH_PROVIDER_METADATA ?? "true").toLowerCase() !==
  "false";

const DEFAULT_LANGFUSE_SETTINGS = {
  envTag: DEFAULT_LANGFUSE_ENV_TAG,
  attachProviderMetadata: DEFAULT_LANGFUSE_ATTACH_PROVIDER_METADATA,
} as const;

const DEFAULT_PROMPT_FALLBACK = normalizeSystemPrompt(DEFAULT_SYSTEM_PROMPT);

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

const normalizeAdditionalPrompt = (
  value: unknown,
  maxLength: number,
): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.replaceAll("\r\n", "\n").trim().slice(0, maxLength);
};

export function getChatModelDefaults(): ChatModelSettings {
  const engine = getDefaultEngine();
  const defaultLlm = resolveLlmModel();
  const defaultEmbedding = resolveEmbeddingSpace();

  return {
    engine,
    llmModelId: defaultLlm.id,
    requestedLlmModelId: defaultLlm.id,
    resolvedLlmModelId: defaultLlm.id,
    llmModelWasSubstituted: false,
    llmSubstitutionReason: undefined,
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
    llmEngine: "unknown",
    policy: { requireLocal: false },
    wantsLocalEngine: false,
    enforcement: "cloud_ok",
    localBackendAvailable: false,
    localLlmBackendEnv: null,
    isLocal: false,
    fallbackFrom: undefined,
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
    attachProviderMetadata: DEFAULT_LANGFUSE_SETTINGS.attachProviderMetadata,
    isDefault: {
      envTag: true,
      attachProviderMetadata: true,
    },
  };
}

function resolvePresetKey(
  adminConfig: AdminChatConfig,
  sessionConfig?: SessionChatConfig,
): string {
  const requestedPreset =
    sessionConfig?.presetId ?? sessionConfig?.appliedPreset ?? "default";
  if (
    requestedPreset === "fast" ||
    requestedPreset === "highRecall" ||
    (adminConfig.presets && requestedPreset in adminConfig.presets)
  ) {
    return requestedPreset;
  }
  return "default";
}

function resolvePromptParts({
  adminConfig,
  sessionConfig,
}: {
  adminConfig: AdminChatConfig;
  sessionConfig?: SessionChatConfig;
}) {
  const maxLength = getAdditionalPromptMaxLength(adminConfig);
  const requestedPreset =
    sessionConfig?.presetId ?? sessionConfig?.appliedPreset ?? "default";
  const presetKey =
    requestedPreset === "fast" ||
    requestedPreset === "highRecall" ||
    (adminConfig.presets && requestedPreset in adminConfig.presets)
      ? requestedPreset
      : "default";

  const basePrompt =
    adminConfig.baseSystemPrompt &&
    adminConfig.baseSystemPrompt.trim().length > 0
      ? normalizeSystemPrompt(adminConfig.baseSystemPrompt)
      : DEFAULT_PROMPT_FALLBACK;

  const presetAdditional = normalizeAdditionalPrompt(
    adminConfig.presets?.[presetKey]?.additionalSystemPrompt,
    maxLength,
  );
  const sessionAdditional = normalizeAdditionalPrompt(
    sessionConfig?.additionalSystemPrompt,
    maxLength,
  );

  return { basePrompt, presetAdditional, sessionAdditional };
}

export function buildFinalSystemPrompt({
  adminConfig,
  sessionConfig,
}: {
  adminConfig: AdminChatConfig;
  sessionConfig?: SessionChatConfig;
}): string {
  const { basePrompt, presetAdditional, sessionAdditional } =
    resolvePromptParts({ adminConfig, sessionConfig });

  return [basePrompt, presetAdditional, sessionAdditional]
    .filter((part) => Boolean(part && String(part).length > 0))
    .join("\n\n");
}

export async function loadSystemPrompt(options?: {
  forceRefresh?: boolean;
  client?: SupabaseClient;
  sessionConfig?: SessionChatConfig;
}): Promise<SystemPromptResult> {
  const shouldUseCache =
    !options?.forceRefresh &&
    !options?.sessionConfig &&
    cachedPrompt &&
    Date.now() - cachedPromptAt < SYSTEM_PROMPT_CACHE_TTL_MS;

  if (shouldUseCache && cachedPrompt) {
    return cachedPrompt;
  }

  const config = await loadAdminChatConfig({
    client: options?.client,
    forceRefresh: options?.forceRefresh,
  });

  const { basePrompt, presetAdditional, sessionAdditional } =
    resolvePromptParts({
      adminConfig: config,
      sessionConfig: options?.sessionConfig,
    });
  const prompt = buildFinalSystemPrompt({
    adminConfig: config,
    sessionConfig: options?.sessionConfig,
  });
  const isDefault =
    basePrompt === DEFAULT_PROMPT_FALLBACK &&
    !presetAdditional &&
    !sessionAdditional;

  const result: SystemPromptResult = { prompt, isDefault };
  if (!options?.sessionConfig) {
    cachedPrompt = result;
    cachedPromptAt = Date.now();
  }
  return result;
}

export async function loadChatModelSettings(options?: {
  forceRefresh?: boolean;
  client?: SupabaseClient;
  sessionConfig?: SessionChatConfig;
  localBackendOverride?: string;
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
  const presetKey = resolvePresetKey(config, options?.sessionConfig);
  const preset = config.presets?.[presetKey] ?? config.presets?.default ?? null;
  const ollamaConfigured = isOllamaConfigured();
  const policyRequireLocal =
    options?.sessionConfig?.requireLocal ?? preset?.requireLocal ?? false;

  ragLogger.debug("[chat-settings preset]", {
    presetKey,
    presetRequireLocal: preset?.requireLocal,
    sessionPreset: options?.sessionConfig?.appliedPreset ?? null,
  });

  const engine = normalizeChatEngine(
    options?.sessionConfig?.chatEngine ?? preset?.chatEngine ?? defaults.engine,
    defaults.engine,
  );

  const modelResolutionContext = {
    ollamaConfigured,
    lmstudioConfigured: isLmStudioConfigured(),
    defaultModelId: DEFAULT_LLM_MODEL_ID,
    defaultModelExplicit: IS_DEFAULT_MODEL_EXPLICIT,
    allowedModelIds: config.allowlist?.llmModels,
  };

  if (options?.sessionConfig?.llmModel) {
    ragLogger.debug(
      "[chat-settings] sessionConfig.llmModel override",
      options.sessionConfig.llmModel,
    );
  }
  const rawLlmModelId =
    options?.sessionConfig?.llmModel ?? preset?.llmModel ?? defaults.llmModelId;

  const normalizedLlmModelId =
    normalizeLlmModelId(rawLlmModelId) ?? rawLlmModelId ?? defaults.llmModelId;

  ragLogger.debug("[chat-settings] resolution trace", {
    raw: rawLlmModelId,
    normalized: normalizedLlmModelId,
    defaults: defaults.llmModelId,
    session: options?.sessionConfig?.llmModel,
  });

  if (
    process.env.NODE_ENV !== "production" &&
    typeof rawLlmModelId === "string" &&
    rawLlmModelId.trim().toLowerCase() === "mistral"
  ) {
    console.warn(
      "[chat-settings] Legacy llmModel 'mistral' encountered; treating it as 'mistral-ollama'. Please migrate admin_chat_config to the explicit ID.",
    );
  }
  let llmResolution = resolveLlmModelId(
    normalizedLlmModelId,
    modelResolutionContext,
  );

  let llmSelection = resolveLlmModel({
    modelId: llmResolution.resolvedModelId,
    model: llmResolution.resolvedModelId,
  });

  const localBackendOverride = options?.localBackendOverride;
  const localClient = getLocalLlmClient(localBackendOverride);
  const localBackend = getLocalLlmBackend(localBackendOverride);
  const requiresLocalModel = llmSelection.isLocal;
  const requestedLocalBackend =
    llmSelection.localBackend ??
    (llmSelection.isLocal ? llmSelection.provider : null);
  const matchesSelectedBackend =
    Boolean(requestedLocalBackend) && localBackend === requestedLocalBackend;

  let localBackendAvailable = false;
  if (requestedLocalBackend === "lmstudio") {
    localBackendAvailable = modelResolutionContext.lmstudioConfigured;
  } else if (requestedLocalBackend === "ollama") {
    localBackendAvailable = modelResolutionContext.ollamaConfigured;
  } else if (requiresLocalModel) {
    // Other local providers? Default to checking client existence for now
    localBackendAvailable = Boolean(localClient) && matchesSelectedBackend;
  }

  const wantsLocalEngine = requiresLocalModel;
  const { enforcement, shouldFallbackToCloud } = resolveRequireLocalEnforcement(
    policyRequireLocal,
    wantsLocalEngine,
    localBackendAvailable,
  );
  let fallbackFrom: ChatRuntimeFallbackFrom | undefined;
  let llmEngine: ChatEngineType;
  const initialLocalSelection = requiresLocalModel ? llmSelection : null;

  if (requiresLocalModel) {
    const intendedLocalEngine =
      requestedLocalBackend === "lmstudio" ? "local-lmstudio" : "local-ollama";
    llmEngine = intendedLocalEngine;
    if (!localBackendAvailable) {
      console.warn(
        `[chat-settings] Local backend unavailable for ${llmSelection.id}.`,
      );
      if (shouldFallbackToCloud) {
        if (initialLocalSelection) {
          fallbackFrom = {
            type: "local",
            provider: initialLocalSelection.provider,
            modelId: initialLocalSelection.id,
          };
        }
        const fallbackResolution = resolveLlmModelId(
          defaults.llmModelId,
          modelResolutionContext,
        );
        llmResolution = fallbackResolution;
        llmSelection = resolveLlmModel({
          modelId: fallbackResolution.resolvedModelId,
          model: fallbackResolution.resolvedModelId,
        });
        llmEngine =
          llmSelection.provider === "gemini"
            ? "gemini"
            : llmSelection.provider === "openai"
              ? "openai"
              : "unknown";
        localBackendAvailable = false;
      }
    }
  } else {
    llmEngine =
      llmSelection.provider === "gemini"
        ? "gemini"
        : llmSelection.provider === "openai"
          ? "openai"
          : "unknown";
    if (policyRequireLocal) {
      console.warn(
        `[chat-settings] Preset requires local backend but resolved model ${llmSelection.id} is cloud-only.`,
      );
    }
  }

  const embeddingSelection = resolveEmbeddingSpace({
    embeddingModelId:
      options?.sessionConfig?.embeddingModel ??
      preset?.embeddingModel ??
      defaults.embeddingModelId,
    embeddingSpaceId: defaults.embeddingSpaceId,
    model:
      options?.sessionConfig?.embeddingModel ??
      preset?.embeddingModel ??
      defaults.embeddingModel,
  });

  const reverseRagEnabled =
    preset?.features.reverseRAG ?? DEFAULT_REVERSE_RAG_ENABLED;
  const reverseRagMode = DEFAULT_REVERSE_RAG_MODE;
  const hydeEnabled = preset?.features.hyde ?? DEFAULT_HYDE_ENABLED;
  const rankerMode = preset?.features.ranker ?? DEFAULT_RANKER_MODE;

  const result: ChatModelSettings = {
    engine,
    llmModelId: llmSelection.id,
    requestedLlmModelId: llmResolution.requestedModelId,
    resolvedLlmModelId: llmResolution.resolvedModelId,
    llmModelWasSubstituted: llmResolution.wasSubstituted,
    llmSubstitutionReason:
      llmResolution.reason !== "NONE" ? llmResolution.reason : undefined,
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
    llmEngine,
    policy: { requireLocal: policyRequireLocal },
    wantsLocalEngine,
    enforcement,
    localBackendAvailable,
    localLlmBackendEnv: localBackend ?? null,
    isLocal: llmSelection.isLocal,
    fallbackFrom,
  };

  cachedChatModelSettings = result;
  cachedChatModelSettingsAt = Date.now();
  return result;
}

export function resolveRequireLocalEnforcement(
  policyRequireLocal: boolean,
  wantsLocalEngine: boolean,
  localBackendAvailable: boolean,
): {
  enforcement: ChatRuntimeEnforcement;
  shouldFallbackToCloud: boolean;
} {
  if (wantsLocalEngine) {
    if (localBackendAvailable) {
      return { enforcement: "local_ok", shouldFallbackToCloud: false };
    }
    return policyRequireLocal
      ? { enforcement: "blocked_require_local", shouldFallbackToCloud: false }
      : { enforcement: "fallback_to_cloud", shouldFallbackToCloud: true };
  }

  return policyRequireLocal
    ? {
        enforcement: "blocked_require_local",
        shouldFallbackToCloud: false,
      }
    : { enforcement: "cloud_ok", shouldFallbackToCloud: false };
}

export function formatRuntimeFallbackFrom(
  fallbackFrom?: ChatRuntimeFallbackFrom,
): "local-ollama" | "local-lmstudio" | undefined {
  if (!fallbackFrom || fallbackFrom.type !== "local") {
    return undefined;
  }
  if (fallbackFrom.provider === "ollama") {
    return "local-ollama";
  }
  if (fallbackFrom.provider === "lmstudio") {
    return "local-lmstudio";
  }
  return undefined;
}

export type RuntimeTelemetryProps = {
  require_local: boolean;
  local_backend_available: boolean;
  enforcement: ChatRuntimeEnforcement;
  fallback_from?: ReturnType<typeof formatRuntimeFallbackFrom>;
  wants_local_engine: boolean;
  resolved_provider: ModelProvider;
  resolved_model_id: string;
  requested_model_id: string | null;
};

export function buildRuntimeTelemetryProps(
  runtime: ChatModelSettings,
): RuntimeTelemetryProps {
  return {
    require_local: runtime.policy.requireLocal,
    local_backend_available: runtime.localBackendAvailable,
    enforcement: runtime.enforcement,
    fallback_from: formatRuntimeFallbackFrom(runtime.fallbackFrom),
    wants_local_engine: runtime.wantsLocalEngine,
    resolved_provider: runtime.llmProvider,
    resolved_model_id: runtime.resolvedLlmModelId,
    requested_model_id: runtime.requestedLlmModelId ?? null,
  };
}

export function buildRequireLocalBlockedPayload(runtime: ChatModelSettings) {
  return {
    error_category: "local_required_unavailable",
    require_local: runtime.policy.requireLocal,
    local_backend_available: runtime.localBackendAvailable,
    enforcement: runtime.enforcement,
    fallback_from: formatRuntimeFallbackFrom(runtime.fallbackFrom),
    message:
      "Local LLM backend is required but unavailable. Please start the configured service.",
  };
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
