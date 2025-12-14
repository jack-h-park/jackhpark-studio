"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { resolveLlmModelId } from "@/lib/shared/model-resolution";
import {
  type AdminChatConfig,
  type AdminChatRuntimeMeta,
  type AdminNumericLimit,
  getAdditionalPromptMaxLength,
  type ModelResolution,
  type SessionChatConfig,
  type SessionChatConfigPreset,
  type SummaryLevel,
} from "@/types/chat-config";

type ChatConfigContextValue = {
  adminConfig: AdminChatConfig;
  runtimeMeta: AdminChatRuntimeMeta;
  sessionConfig: SessionChatConfig;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
};

const STORAGE_KEY = "chat-session-config";

const ChatConfigContext = createContext<ChatConfigContextValue | null>(null);

const summaryLevels = new Set<SummaryLevel>(["off", "low", "medium", "high"]);

const clampValue = (value: number, limit: AdminNumericLimit): number =>
  Math.min(limit.max, Math.max(limit.min, value));

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

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const sanitizeNumericConfig = (
  candidate: SessionChatConfig,
  adminConfig: AdminChatConfig,
  resolver: {
    resolveModel: (modelId: string) => ModelResolution;
  },
): SessionChatConfig => {
  const { numericLimits, allowlist } = adminConfig;
  const additionalPromptLimit = getAdditionalPromptMaxLength(adminConfig);

  const topK = isFiniteNumber(candidate.rag.topK)
    ? clampValue(candidate.rag.topK, numericLimits.ragTopK)
    : numericLimits.ragTopK.default;
  const similarity = isFiniteNumber(candidate.rag.similarity)
    ? clampValue(candidate.rag.similarity, numericLimits.similarityThreshold)
    : numericLimits.similarityThreshold.default;

  const contextBudget = isFiniteNumber(candidate.context.tokenBudget)
    ? clampValue(candidate.context.tokenBudget, numericLimits.contextBudget)
    : numericLimits.contextBudget.default;
  const historyBudget = isFiniteNumber(candidate.context.historyBudget)
    ? clampValue(candidate.context.historyBudget, numericLimits.historyBudget)
    : numericLimits.historyBudget.default;
  const clipTokens = isFiniteNumber(candidate.context.clipTokens)
    ? clampValue(candidate.context.clipTokens, numericLimits.clipTokens)
    : numericLimits.clipTokens.default;

  const summaryLevel = summaryLevels.has(candidate.summaryLevel)
    ? candidate.summaryLevel
    : "off";

  const additionalPrompt =
    typeof candidate.additionalSystemPrompt === "string"
      ? candidate.additionalSystemPrompt.slice(0, additionalPromptLimit)
      : "";

  const ranker = sanitizeModel(
    candidate.features.ranker,
    allowlist.rankers,
    allowlist.rankers[0] ?? "none",
  );

  const requestedModelId =
    candidate.llmModelResolution?.requestedModelId &&
    candidate.llmModel === candidate.llmModelResolution.resolvedModelId
      ? candidate.llmModelResolution.requestedModelId
      : (candidate.llmModel ?? adminConfig.presets.default.llmModel);
  const llmResolution = resolver.resolveModel(requestedModelId);

  const reverseRAG = allowlist.allowReverseRAG
    ? Boolean(candidate.features.reverseRAG)
    : false;
  const hyde = allowlist.allowHyde ? Boolean(candidate.features.hyde) : false;

  return {
    presetId: candidate.presetId ?? candidate.appliedPreset ?? "default",
    additionalSystemPrompt: additionalPrompt,
    llmModel: llmResolution.resolvedModelId as SessionChatConfig["llmModel"],
    embeddingModel: sanitizeModel(
      candidate.embeddingModel,
      allowlist.embeddingModels,
      adminConfig.presets.default.embeddingModel,
    ),
    chatEngine: sanitizeModel(
      candidate.chatEngine,
      allowlist.chatEngines,
      adminConfig.presets.default.chatEngine,
    ),
    rag: {
      enabled: Boolean(candidate.rag.enabled),
      topK,
      similarity,
    },
    context: {
      tokenBudget: contextBudget,
      historyBudget,
      clipTokens,
    },
    features: {
      reverseRAG,
      hyde,
      ranker,
    },
    llmModelResolution: llmResolution,
    summaryLevel,
    appliedPreset: candidate.appliedPreset,
    requireLocal: Boolean(candidate.requireLocal),
  };
};

const buildDefaultSessionConfig = (
  preset: SessionChatConfigPreset,
  presetName: ChatConfigContextValue["sessionConfig"]["appliedPreset"],
  resolution: ModelResolution | null,
): SessionChatConfig => ({
  ...preset,
  presetId: presetName ?? "default",
  additionalSystemPrompt:
    typeof (preset as SessionChatConfig).additionalSystemPrompt === "string"
      ? (preset as SessionChatConfig).additionalSystemPrompt
      : "",
  llmModel: (resolution?.resolvedModelId ??
    preset.llmModel) as SessionChatConfig["llmModel"],
  llmModelResolution:
    resolution ??
    ({
      requestedModelId: preset.llmModel,
      resolvedModelId: preset.llmModel,
      wasSubstituted: false,
      reason: "NONE",
    } satisfies ModelResolution),
  appliedPreset: presetName ?? undefined,
  requireLocal: Boolean(preset.requireLocal),
});

export function ChatConfigProvider({
  adminConfig,
  runtimeMeta,
  children,
}: {
  adminConfig: AdminChatConfig;
  runtimeMeta: AdminChatRuntimeMeta;
  children: ReactNode;
}) {
  const resolveLlmModelForSession = useMemo(() => {
    const allowedModels = adminConfig.allowlist.llmModels;
    return (modelId: string): ModelResolution =>
      resolveLlmModelId(modelId, {
        ollamaConfigured: runtimeMeta.ollamaConfigured,
        lmstudioConfigured: runtimeMeta.lmstudioConfigured,
        defaultModelId: runtimeMeta.defaultLlmModelId,
        defaultModelExplicit: runtimeMeta.defaultLlmModelExplicit,
        allowedModelIds: allowedModels,
      });
  }, [
    adminConfig.allowlist.llmModels,
    runtimeMeta.defaultLlmModelId,
    runtimeMeta.defaultLlmModelExplicit,
    runtimeMeta.ollamaConfigured,
    runtimeMeta.lmstudioConfigured,
  ]);

  const defaultConfig = useMemo(
    () =>
      buildDefaultSessionConfig(
        adminConfig.presets.default,
        "default",
        runtimeMeta.presetResolutions.default,
      ),
    [adminConfig.presets, runtimeMeta.presetResolutions],
  );

  const [sessionConfig, setSessionConfigState] =
    useState<SessionChatConfig>(defaultConfig);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setSessionConfigState(defaultConfig);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as SessionChatConfig;
      setSessionConfigState(
        sanitizeNumericConfig({ ...defaultConfig, ...parsed }, adminConfig, {
          resolveModel: resolveLlmModelForSession,
        }),
      );
    } catch {
      setSessionConfigState(defaultConfig);
    }
  }, [adminConfig, defaultConfig, resolveLlmModelForSession]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionConfig));
  }, [sessionConfig]);

  const setSessionConfig = useCallback(
    (
      value:
        | SessionChatConfig
        | ((prev: SessionChatConfig) => SessionChatConfig),
    ) => {
      setSessionConfigState((prev) =>
        sanitizeNumericConfig(
          typeof value === "function" ? value(prev) : value,
          adminConfig,
          { resolveModel: resolveLlmModelForSession },
        ),
      );
    },
    [adminConfig, resolveLlmModelForSession],
  );

  const contextValue = useMemo(
    () => ({
      adminConfig,
      runtimeMeta,
      sessionConfig,
      setSessionConfig,
    }),
    [adminConfig, runtimeMeta, sessionConfig, setSessionConfig],
  );

  return (
    <ChatConfigContext.Provider value={contextValue}>
      {children}
    </ChatConfigContext.Provider>
  );
}

export function useChatConfig(): ChatConfigContextValue {
  const context = useContext(ChatConfigContext);
  if (!context) {
    throw new Error("useChatConfig must be used within ChatConfigProvider");
  }
  return context;
}
