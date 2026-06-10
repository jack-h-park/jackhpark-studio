import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmbeddingResolutionSnapshot } from "@/lib/server/telemetry/embedding-trace";
import type {
  ChatEngineType,
  EmbeddingSpaceWarning,
  SessionChatConfig,
} from "@/types/chat-config";
import { normalizeLlmModelId } from "@/lib/core/llm-registry";
import {
  resolveEmbeddingSpace,
  resolveLlmModel,
} from "@/lib/core/model-provider";
import { getLocalLlmBackend, getLocalLlmClient } from "@/lib/local-llm";
import { ragLogger } from "@/lib/logging/logger";
import { loadAdminChatConfig } from "@/lib/server/admin-chat-config";
import { buildModelResolutionContext } from "@/lib/server/model-resolution";
import { USER_TUNABLE_KEYS } from "@/lib/shared/chat-settings-policy";
import { type ModelProvider } from "@/lib/shared/model-provider";
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

import { resolveEmbeddingSettings } from "./embedding-settings";
import { resolvePresetKey } from "./preset-resolution";
import { TtlCache } from "./ttl-cache";

const CHAT_MODEL_SETTINGS_CACHE_TTL_MS = 60_000;

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
  engine: "lc";
  llmModelId: string;
  requestedLlmModelId: string;
  resolvedLlmModelId: string;
  llmModelWasSubstituted: boolean;
  llmSubstitutionReason?: ModelResolutionReason;
  embeddingModelId: string;
  embeddingSpaceId: string;
  embeddingResolutionSnapshot: EmbeddingResolutionSnapshot;
  llmProvider: ModelProvider;
  embeddingProvider: ModelProvider;
  llmModel: string;
  embeddingModel: string;
  embeddingSpaceWarnings?: EmbeddingSpaceWarning[];
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
  safeMode: boolean;
};

const chatModelSettingsCache = new TtlCache<ChatModelSettings>(
  CHAT_MODEL_SETTINGS_CACHE_TTL_MS,
);

export function getChatModelDefaults(): ChatModelSettings {
  const defaultLlm = resolveLlmModel();
  const defaultEmbedding = resolveEmbeddingSpace();

  return {
    engine: "lc",
    llmModelId: defaultLlm.id,
    requestedLlmModelId: defaultLlm.id,
    resolvedLlmModelId: defaultLlm.id,
    llmModelWasSubstituted: false,
    llmSubstitutionReason: undefined,
    embeddingModelId: defaultEmbedding.embeddingModelId,
    embeddingSpaceId: defaultEmbedding.embeddingSpaceId,
    embeddingResolutionSnapshot: {
      resolvedProvider: defaultEmbedding.provider,
      resolvedModel: defaultEmbedding.model,
      resolvedSpaceId: defaultEmbedding.embeddingSpaceId,
      reason: "global_default",
      source: "defaults",
    },
    llmProvider: defaultLlm.provider,
    embeddingProvider: defaultEmbedding.provider,
    llmModel: defaultLlm.model,
    embeddingModel: defaultEmbedding.model,
    embeddingSpaceWarnings: undefined,
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
    safeMode: false,
  };
}

export function enforceSessionPolicy(sessionConfig?: SessionChatConfig) {
  const enforced: Partial<SessionChatConfig> = {};
  const droppedKeys: string[] = [];
  if (sessionConfig) {
    for (const key of Object.keys(sessionConfig)) {
      if (USER_TUNABLE_KEYS.includes(key as keyof SessionChatConfig)) {
        // Safe to copy
        // @ts-expect-error - dynamic assignment of filtered keys to Partial<SessionChatConfig>
        enforced[key] = sessionConfig[key];
      } else {
        droppedKeys.push(key);
      }
    }
  }
  return { enforced, droppedKeys };
}

export async function loadChatModelSettings(options?: {
  forceRefresh?: boolean;
  client?: SupabaseClient;
  sessionConfig?: SessionChatConfig;
  localBackendOverride?: string;
}): Promise<ChatModelSettings> {
  // Session-specific resolutions must never be served from (or written to)
  // the shared cache; only the no-override path is cacheable.
  const cacheable = !options?.sessionConfig && !options?.localBackendOverride;
  const cached =
    cacheable && !options?.forceRefresh ? chatModelSettingsCache.get() : null;
  if (cached) {
    return cached;
  }

  const config = await loadAdminChatConfig({
    client: options?.client,
    forceRefresh: options?.forceRefresh,
  });
  const defaults = getChatModelDefaults();
  const presetKey = resolvePresetKey(config, options?.sessionConfig);
  const preset = config.presets?.[presetKey] ?? config.presets?.default ?? null;
  const policyRequireLocal =
    options?.sessionConfig?.requireLocal ?? preset?.requireLocal ?? false;

  ragLogger.debug("[chat-settings preset]", {
    presetKey,
    presetRequireLocal: preset?.requireLocal,
    sessionPreset: options?.sessionConfig?.appliedPreset ?? null,
  });

  const engine = "lc";
  const safeMode = Boolean(
    options?.sessionConfig?.safeMode ?? preset?.safeMode ?? defaults.safeMode,
  );

  const modelResolutionContext = buildModelResolutionContext(config);

  if (options?.sessionConfig?.llmModel) {
    ragLogger.debug(
      "[chat-settings] sessionConfig.llmModel override",
      options.sessionConfig.llmModel,
    );
  }

  // Weak Lockdown Enforcement: explicitly filter the sessionConfig to only
  // allow tunable keys. Any other key found in sessionConfig is ignored
  // (effectively falling back to Preset/Default).
  const { enforced: enforcedSessionConfig, droppedKeys } = enforceSessionPolicy(
    options?.sessionConfig,
  );

  if (droppedKeys.length > 0) {
    ragLogger.info(
      "[chat-settings] Weak Lockdown: Dropped forbidden keys from sessionConfig",
      {
        action: "lockdown_warn",
        droppedKeys,
        allowedKeys: USER_TUNABLE_KEYS,
      },
    );
  }

  const effectiveSessionConfig =
    Object.keys(enforcedSessionConfig).length > 0
      ? (enforcedSessionConfig as SessionChatConfig)
      : undefined;

  const rawLlmModelId =
    effectiveSessionConfig?.llmModel ?? preset?.llmModel ?? defaults.llmModelId;

  const normalizedLlmModelId =
    normalizeLlmModelId(rawLlmModelId) ?? rawLlmModelId ?? defaults.llmModelId;

  ragLogger.debug("[chat-settings] resolution trace", {
    raw: rawLlmModelId,
    normalized: normalizedLlmModelId,
    defaults: defaults.llmModelId,
    session: effectiveSessionConfig?.llmModel,
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

  const {
    embeddingSelection,
    embeddingResolutionSnapshot,
    embeddingSpaceWarnings,
  } = resolveEmbeddingSettings({
    sessionConfig: options?.sessionConfig,
    preset,
    presetKey,
    defaults,
    embeddingAllowlist: config.allowlist?.embeddingModels,
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
    embeddingResolutionSnapshot,
    llmProvider: llmSelection.provider,
    embeddingProvider: embeddingSelection.provider,
    llmModel: llmSelection.model,
    embeddingModel: embeddingSelection.model,
    embeddingSpaceWarnings,
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
    safeMode,
    wantsLocalEngine,
    enforcement,
    localBackendAvailable,
    localLlmBackendEnv: localBackend ?? null,
    isLocal: llmSelection.isLocal,
    fallbackFrom,
  };

  if (cacheable) {
    chatModelSettingsCache.set(result);
  }
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
  safe_mode: boolean;
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
    safe_mode: runtime.safeMode,
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
