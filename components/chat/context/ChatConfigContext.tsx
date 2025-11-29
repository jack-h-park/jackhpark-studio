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

import type {
  AdminChatConfig,
  AdminNumericLimit,
  SessionChatConfig,
  SessionChatConfigPreset,
  SummaryLevel,
} from "@/types/chat-config";

type ChatConfigContextValue = {
  adminConfig: AdminChatConfig;
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
): SessionChatConfig => {
  const { numericLimits, allowlist } = adminConfig;

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

  const userPrompt =
    typeof candidate.userSystemPrompt === "string"
      ? candidate.userSystemPrompt.slice(
          0,
          adminConfig.userSystemPromptMaxLength,
        )
      : adminConfig.userSystemPromptDefault;

  const ranker = sanitizeModel(
    candidate.features.ranker,
    allowlist.rankers,
    allowlist.rankers[0] ?? "none",
  );

  const reverseRAG = allowlist.allowReverseRAG
    ? Boolean(candidate.features.reverseRAG)
    : false;
  const hyde = allowlist.allowHyde ? Boolean(candidate.features.hyde) : false;

  return {
    userSystemPrompt: userPrompt,
    llmModel: sanitizeModel(
      candidate.llmModel,
      allowlist.llmModels,
      adminConfig.presets.default.llmModel,
    ),
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
    summaryLevel,
    appliedPreset: candidate.appliedPreset,
  };
};

const buildDefaultSessionConfig = (
  preset: SessionChatConfigPreset,
  presetName: ChatConfigContextValue["sessionConfig"]["appliedPreset"],
): SessionChatConfig => ({
  ...preset,
  appliedPreset: presetName ?? undefined,
});

export function ChatConfigProvider({
  adminConfig,
  children,
}: {
  adminConfig: AdminChatConfig;
  children: ReactNode;
}) {
  const defaultConfig = useMemo(
    () => buildDefaultSessionConfig(adminConfig.presets.default, "default"),
    [adminConfig.presets],
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
        sanitizeNumericConfig({ ...defaultConfig, ...parsed }, adminConfig),
      );
    } catch {
      setSessionConfigState(defaultConfig);
    }
  }, [adminConfig, defaultConfig]);

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
        ),
      );
    },
    [adminConfig],
  );

  const contextValue = useMemo(
    () => ({
      adminConfig,
      sessionConfig,
      setSessionConfig,
    }),
    [adminConfig, sessionConfig, setSessionConfig],
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
