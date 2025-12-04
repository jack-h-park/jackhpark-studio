"use client";

import { AiOutlineArrowsAlt } from "@react-icons/all-files/ai/AiOutlineArrowsAlt";
import { AiOutlineClose } from "@react-icons/all-files/ai/AiOutlineClose";
import { AiOutlineCompress } from "@react-icons/all-files/ai/AiOutlineCompress";
import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { GiBrain } from "@react-icons/all-files/gi/GiBrain";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { ChatMessagesPanel } from "@/components/chat/ChatMessagesPanel";
import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { useChatSession } from "@/components/chat/hooks/useChatSession";
import { Switch } from "@/components/ui/switch";
import { MODEL_PROVIDER_LABELS } from "@/lib/shared/model-provider";

import styles from "./ChatWindow.module.css";

export type ChatWindowProps = {
  isOpen: boolean;
  showExpandButton?: boolean;
  showCloseButton?: boolean;
  onClose?: () => void;
  headerAction?: ReactNode;
};

export function ChatWindow({
  isOpen,
  showCloseButton = true,
  showExpandButton = true,
  onClose,
  headerAction,
}: ChatWindowProps) {
  const [input, setInput] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    isLoading,
    runtimeConfig,
    loadingAssistantId,
    sendMessage,
  } = useChatSession({ source: "floating-widget" });

  const {
    showTelemetry,
    telemetryAutoExpand,
    showCitations,
    setShowTelemetry: setDisplayShowTelemetry,
    setTelemetryAutoExpand: setDisplayTelemetryAutoExpand,
    setShowCitations: setDisplayShowCitations,
  } = useChatDisplaySettings();
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);

  useEffect(() => {
    if (!showTelemetry) {
      setTelemetryExpanded(false);
      return;
    }
    if (telemetryAutoExpand) {
      setTelemetryExpanded(true);
    }
  }, [showTelemetry, telemetryAutoExpand]);

  const toggleTelemetry = () => {
    const next = !showTelemetry;
    setDisplayShowTelemetry(next);
    setTelemetryExpanded(next ? true : false);
  };

  const toggleTelemetryExpanded = () => {
    setTelemetryExpanded((prev) => !prev);
  };

  const handleAutoExpandChange = (checked: boolean) => {
    setDisplayTelemetryAutoExpand(checked);
    if (checked && showTelemetry) {
      setTelemetryExpanded(true);
    }
  };

  const toggleCitations = () => {
    setDisplayShowCitations(!showCitations);
  };

  const handleTelemetrySwitchChange = (checked: boolean) => {
    if (checked !== showTelemetry) {
      toggleTelemetry();
    }
  };

  const handleCitationsSwitchChange = (checked: boolean) => {
    if (checked !== showCitations) {
      toggleCitations();
    }
  };

  const toggleOptions = () => {
    setShowOptions((prev) => !prev);
  };

  const runtimeLlmWasSubstituted = runtimeConfig?.llmModelWasSubstituted;
  const runtimeRequestedModelId =
    runtimeConfig?.requestedLlmModelId ?? runtimeConfig?.llmModelId ?? null;
  const runtimeResolvedModelId =
    runtimeConfig?.resolvedLlmModelId ??
    runtimeConfig?.llmModelId ??
    runtimeConfig?.llmModel ??
    null;
  const runtimeSubstitutionTooltip = runtimeLlmWasSubstituted
    ? `Model substituted at runtime: ${runtimeRequestedModelId ?? "requested"} → ${runtimeResolvedModelId ?? "resolved"}`
    : undefined;
  const runtimeEngineDisplay = (() => {
    switch (runtimeConfig?.llmEngine) {
      case "local-ollama":
        return "Local (Ollama)";
      case "local-lmstudio":
        return "Local (LM Studio)";
      case "openai":
        return "Cloud (OpenAI)";
      case "gemini":
        return "Cloud (Gemini)";
      default:
        return "Unknown engine";
    }
  })();
  const showRuntimeEngineLabel = Boolean(runtimeConfig?.llmEngine);
  const showRequireLocalError =
    runtimeConfig?.requireLocal &&
    runtimeConfig?.llmEngine?.startsWith("local") &&
    !runtimeConfig.localBackendAvailable;
  const showFallbackNotice =
    !showRequireLocalError &&
    Boolean(
      runtimeConfig?.fallbackFrom &&
        runtimeConfig.llmEngine !== runtimeConfig.fallbackFrom,
    );

  const focusInput = useCallback(() => {
    if (!isOpen) {
      return;
    }
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [isOpen]);

  const togglePanelSize = () => {
    setIsExpanded((prev) => !prev);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      focusInput();
    }
  }, [focusInput, isOpen]);

  useEffect(() => {
    if (!isLoading) {
      focusInput();
    }
  }, [focusInput, isLoading]);

  const handleSubmit = () => {
    const value = input.trim();
    if (!value || isLoading || showRequireLocalError) {
      return;
    }
    void sendMessage(value);
    setInput("");
  };

  return (
    <>
      <div
        className={`${styles.chatPanel} ${isOpen ? styles.isOpen : ""} ${
          isExpanded ? styles.isLarge : ""
        }`}
      >
        <header className={styles.chatHeader}>
          <div className={styles.chatHeaderTop}>
            <div className={styles.chatHeaderTitle}>
              <GiBrain />
              <h3>Jack's AI Assistant</h3>
            </div>
            <div className={styles.chatHeaderActions}>
              {runtimeLlmWasSubstituted && (
                <FiAlertCircle
                  aria-hidden="true"
                  className="text-slate-500"
                  size={14}
                  title={`Model substituted at runtime: ${runtimeRequestedModelId ?? "requested"} → ${runtimeResolvedModelId ?? "resolved"}`}
                />
              )}
              <button
                type="button"
                className={styles.chatConfigToggle}
                onClick={toggleOptions}
              >
                {showOptions ? "Hide Settings" : "Show Settings"}
              </button>
              {headerAction}
              {showExpandButton && (
                <button
                  type="button"
                  className={styles.chatExpandButton}
                  aria-label={
                    isExpanded ? "Shrink chat panel" : "Expand chat panel"
                  }
                  onClick={togglePanelSize}
                >
                  {isExpanded ? (
                    <AiOutlineCompress size={16} />
                  ) : (
                    <AiOutlineArrowsAlt size={16} />
                  )}
                </button>
              )}
              {showCloseButton && (
                <button
                  className={styles.chatCloseButton}
                  onClick={onClose}
                  aria-label="Close chat"
                  type="button"
                >
                  <AiOutlineClose size={20} />
                </button>
              )}
            </div>
          </div>
          {(showRuntimeEngineLabel || showFallbackNotice) && (
            <div className={styles.chatEngineRow}>
              {showRuntimeEngineLabel && (
                <span className={styles.chatEngineBadge}>
                  {runtimeEngineDisplay}
                  {showFallbackNotice && runtimeConfig?.fallbackFrom && (
                    <span className={styles.chatEngineFallbackLabel}>
                      (fallback from{" "}
                      {runtimeConfig.fallbackFrom === "local-ollama"
                        ? "Local (Ollama)"
                        : runtimeConfig.fallbackFrom === "local-lmstudio"
                          ? "Local (LM Studio)"
                          : runtimeConfig.fallbackFrom === "openai"
                            ? "Cloud (OpenAI)"
                            : runtimeConfig.fallbackFrom === "gemini"
                              ? "Cloud (Gemini)"
                              : "Unknown"})
                    </span>
                  )}
                </span>
              )}
              {showFallbackNotice && !showRuntimeEngineLabel && (
                <span className={styles.chatEngineFallbackNotice}>
                  Local backend unavailable, using default cloud model.
                </span>
              )}
            </div>
          )}
          {showRequireLocalError && (
            <div className={styles.chatEngineErrorBanner}>
              <FiAlertCircle aria-hidden="true" />
              <span>
                Local LLM backend is required for this preset but is not available.
                Please check the LOCAL_LLM_BACKEND configuration or switch presets.
              </span>
            </div>
          )}
          {showOptions && (
            <div className={styles.chatConfigBar}>
              <div className={styles.chatControlBlock}>
                <span className="ai-field__label">Engine &amp; model</span>
                {runtimeConfig ? (
                  <>
                    <div className={styles.chatRuntimeSummary}>
                      <div className={styles.chatRuntimeSummaryRow}>
                        <span className={styles.chatRuntimeSummaryLabel}>
                          Engine
                        </span>
                        <span className={styles.chatRuntimeSummaryValue}>
                          {runtimeConfig.engine === "lc"
                            ? "LangChain"
                            : "Native"}
                        </span>
                      </div>
                      <div className={styles.chatRuntimeSummaryRow}>
                        <span className={styles.chatRuntimeSummaryLabel}>
                          LLM
                        </span>
                        <span
                          className={`${styles.chatRuntimeSummaryValue} inline-flex items-center gap-1`}
                        >
                          {runtimeConfig.llmProvider === "openai"
                            ? "OpenAI"
                            : MODEL_PROVIDER_LABELS[
                                runtimeConfig.llmProvider
                              ]}{" "}
                          {runtimeConfig.llmModel ?? "custom model"}
                          {runtimeLlmWasSubstituted && (
                            <FiAlertCircle
                              aria-hidden="true"
                              className="text-slate-500"
                              size={12}
                              title={runtimeSubstitutionTooltip}
                            />
                          )}
                        </span>
                      </div>
                      <div className={styles.chatRuntimeSummaryRow}>
                        <span className={styles.chatRuntimeSummaryLabel}>
                          Embedding
                        </span>
                        <span className={styles.chatRuntimeSummaryValue}>
                          {runtimeConfig.embeddingModelId ??
                            runtimeConfig.embeddingModel ??
                            "custom embedding"}
                        </span>
                      </div>
                    </div>
                    <div className={styles.chatRuntimeFlags}>
                      <span
                        className={styles.chatRuntimeFlag}
                        title="Reverse RAG enables query rewriting before retrieval"
                      >
                        Reverse RAG:{" "}
                        {runtimeConfig.reverseRagEnabled
                          ? `on (${runtimeConfig.reverseRagMode})`
                          : "off"}
                      </span>
                      <span
                        className={styles.chatRuntimeFlag}
                        title="Ranker mode applied after the initial retrieval"
                      >
                        Ranker: {runtimeConfig.rankerMode.toUpperCase()}
                      </span>
                      <span
                        className={styles.chatRuntimeFlag}
                        title="HyDE generates a hypothetical document before embedding"
                      >
                        HyDE: {runtimeConfig.hydeEnabled ? "on" : "off"}
                      </span>
                      {runtimeLlmWasSubstituted && (
                        <span
                          className={styles.chatRuntimeFlag}
                          title={runtimeSubstitutionTooltip}
                        >
                          Model substituted
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.chatRuntimeSummary}>
                      <div className={styles.chatRuntimeSummaryRow}>
                        <span className={styles.chatRuntimeSummaryLabel}>
                          Engine
                        </span>
                        <span className={styles.chatRuntimeSummaryValue}>
                          Default preset
                        </span>
                      </div>
                      <div className={styles.chatRuntimeSummaryRow}>
                        <span className={styles.chatRuntimeSummaryLabel}>
                          LLM
                        </span>
                        <span className={styles.chatRuntimeSummaryValue}>
                          Loading…
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className={styles.chatControlBlock}>
                <div className={styles.guardrailToggleRow}>
                  <div className={`${styles.guardrailDescription} ai-choice`}>
                    <span className="ai-choice__label">Telemetry badges</span>
                    <p className="ai-choice__description">
                      Show engine, guardrail, and enhancement insights
                    </p>
                  </div>
                  <Switch
                    className={styles.guardrailToggleRowSwitch}
                    checked={showTelemetry}
                    onCheckedChange={handleTelemetrySwitchChange}
                    aria-label="Toggle telemetry visibility"
                  />
                </div>
                <div
                  className={`${styles.guardrailToggleRow} ${styles.guardrailToggleRowAuto}`}
                >
                  <div className={`${styles.guardrailDescription} ai-choice`}>
                    <span className="ai-choice__label">
                      Auto expand telemetry on toggle
                    </span>
                  </div>
                  <Switch
                    className={styles.guardrailToggleRowSwitch}
                    checked={telemetryAutoExpand}
                    onCheckedChange={handleAutoExpandChange}
                    aria-label="Toggle auto expand telemetry"
                  />
                </div>
              </div>
              <div className={styles.chatControlBlock}>
                <div className={styles.guardrailToggleRow}>
                  <div className={`${styles.guardrailDescription} ai-choice`}>
                    <span className="ai-choice__label">Citations</span>
                    <p className="ai-choice__description">
                      Show every retrieved source (tiny text)
                    </p>
                  </div>
                  <Switch
                    className={styles.guardrailToggleRowSwitch}
                    checked={showCitations}
                    onCheckedChange={handleCitationsSwitchChange}
                    aria-label="Toggle citation visibility"
                  />
                </div>
              </div>
            </div>
          )}
        </header>

        <div className={styles.chatMessages}>
          <ChatMessagesPanel
            messages={messages}
            isLoading={isLoading}
            loadingAssistantId={loadingAssistantId}
            showTelemetry={showTelemetry}
            telemetryExpanded={telemetryExpanded}
            onToggleTelemetryExpanded={toggleTelemetryExpanded}
            showCitations={showCitations}
            showPlaceholder={false}
          />
          <div ref={messagesEndRef} />
        </div>

        <ChatInputBar
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          inputRef={inputRef}
          placeholder="Ask me anything about Jack..."
        />
      </div>
    </>
  );
}
