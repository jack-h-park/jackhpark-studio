"use client";

import { AiOutlineArrowsAlt } from "@react-icons/all-files/ai/AiOutlineArrowsAlt";
import { AiOutlineClose } from "@react-icons/all-files/ai/AiOutlineClose";
import { AiOutlineCompress } from "@react-icons/all-files/ai/AiOutlineCompress";
import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiChevronRight } from "@react-icons/all-files/fi/FiChevronRight";
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
import { useChatScroll } from "@/components/chat/hooks/useChatScroll";
import { useChatSession } from "@/components/chat/hooks/useChatSession";
import { Switch } from "@/components/ui/switch";
import {
  MODEL_PROVIDER_LABELS,
  type ModelProvider,
} from "@/lib/shared/model-provider";

import styles from "./ChatFloatingWindow.module.css";

export type ChatFloatingWindowProps = {
  isOpen: boolean;
  showExpandButton?: boolean;
  showCloseButton?: boolean;
  onClose?: () => void;
  headerAction?: ReactNode;
};

export function ChatFloatingWindow({
  isOpen,
  showCloseButton = true,
  showExpandButton = true,
  onClose,
  headerAction,
}: ChatFloatingWindowProps) {
  const [input, setInput] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  // const messagesEndRef = useRef<HTMLDivElement>(null); // Removed: using useChatScroll
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    isLoading,
    runtimeConfig,
    loadingAssistantId,
    sendMessage,
    abortActiveRequest,
  } = useChatSession({ source: "floating-widget" });

  const {
    showTelemetry,
    showCitations,
    detailsExpanded,
    setShowTelemetry: setDisplayShowTelemetry,
    setShowCitations: setDisplayShowCitations,
    setDetailsExpanded,
  } = useChatDisplaySettings();

  const toggleTelemetry = () => {
    const next = !showTelemetry;
    setDisplayShowTelemetry(next);
  };

  const toggleCitations = () => {
    const next = !showCitations;
    setDisplayShowCitations(next);
  };

  const toggleDetails = () => {
    setDetailsExpanded(!detailsExpanded);
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

  // Removed runtimeEngineDisplay and badge logic as requested
  const showRequireLocalError =
    runtimeConfig?.requireLocal &&
    runtimeConfig?.llmEngine?.startsWith("local") &&
    !runtimeConfig.localBackendAvailable;

  // Condensed Summary construction
  const engineLabel = runtimeConfig?.safeMode
    ? "LangChain (Safe Mode)"
    : "LangChain";
  const llmStr = runtimeConfig
    ? `${runtimeConfig.llmProvider === "openai" ? "OpenAI" : MODEL_PROVIDER_LABELS[runtimeConfig.llmProvider]} ${runtimeConfig.llmModel ?? "custom"}`
    : "Loading...";
  const embedStr =
    runtimeConfig?.embeddingModelId ??
    runtimeConfig?.embeddingModel ??
    "custom embedding";

  const summaryLine = `${engineLabel} · ${llmStr} · ${embedStr}`;

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

  const { scrollRef, onScroll } = useChatScroll({
    messages,
    isLoading,
  });

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
        </header>
        <div
          className={styles.scrollableContent}
          ref={scrollRef}
          onScroll={onScroll}
        >
          {showRequireLocalError && (
            <div className={styles.requireLocalErrorBanner}>
              <FiAlertCircle aria-hidden="true" />
              <span>
                Local LLM backend is required for this preset but is not
                available. Please check the LOCAL_LLM_BACKEND configuration or
                switch presets.
              </span>
            </div>
          )}

          {showOptions && (
            <div className={styles.chatConfigBar}>
              {/* 1. Condensed Summary Line */}
              <div
                className={styles.modelSummaryRow}
                onClick={toggleDetails}
                role="button"
                tabIndex={0}
                aria-expanded={detailsExpanded}
                aria-label="Toggle details"
              >
                <div className={styles.modelSummaryText} title={summaryLine}>
                  {summaryLine}
                </div>
                <FiChevronRight
                  className={`${styles.chevron} ${detailsExpanded ? styles.chevronRotated : ""}`}
                />
              </div>

              {/* 2. Compact Switches */}
              <div className={styles.compactSwitches}>
                <div
                  className={styles.compactSwitchRow}
                  title="Show debug telemetry like performance metrics and model info."
                >
                  <span>Telemetry</span>
                  <Switch
                    checked={showTelemetry}
                    onCheckedChange={handleTelemetrySwitchChange}
                    aria-label="Toggle telemetry"
                  />
                </div>
                <div
                  className={styles.compactSwitchRow}
                  title="Show source citations in chat responses."
                >
                  <span>Citations</span>
                  <Switch
                    checked={showCitations}
                    onCheckedChange={handleCitationsSwitchChange}
                    aria-label="Toggle citations"
                  />
                </div>
              </div>

              {/* 3. Details Section */}
              {detailsExpanded && (
                <div className={styles.detailsSection}>
                  <div className={styles.detailsRow}>
                    <span className={styles.detailsLabel}>Engine:</span>
                    <span className={styles.detailsValue}>{engineLabel}</span>
                  </div>
                  <div className={styles.detailsRow}>
                    <span className={styles.detailsLabel}>LLM:</span>
                    <span className={styles.detailsValue}>
                      {runtimeConfig?.llmProvider === "openai"
                        ? "OpenAI"
                        : MODEL_PROVIDER_LABELS[
                            runtimeConfig?.llmProvider as ModelProvider
                          ]}{" "}
                      {runtimeConfig?.llmModel ?? "custom"} (
                      {runtimeConfig?.isLocal ? "Local" : "Cloud"})
                    </span>
                  </div>
                  <div className={styles.detailsRow}>
                    <span className={styles.detailsLabel}>Embed:</span>
                    <span className={styles.detailsValue}>{embedStr}</span>
                  </div>

                  {runtimeConfig && (
                    <>
                      <div className={styles.detailsRow}>
                        <span className={styles.detailsLabel}>Rev RAG:</span>
                        <span className={styles.detailsValue}>
                          {runtimeConfig.reverseRagEnabled
                            ? `on (${runtimeConfig.reverseRagMode})`
                            : "off"}
                        </span>
                      </div>
                      <div className={styles.detailsRow}>
                        <span className={styles.detailsLabel}>Ranker:</span>
                        <span className={styles.detailsValue}>
                          {runtimeConfig.rankerMode.toUpperCase()}
                        </span>
                      </div>
                      <div className={styles.detailsRow}>
                        <span className={styles.detailsLabel}>HyDE:</span>
                        <span className={styles.detailsValue}>
                          {runtimeConfig.hydeEnabled ? "on" : "off"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className={styles.chatMessages}>
            <ChatMessagesPanel
              messages={messages}
              isLoading={isLoading}
              loadingAssistantId={loadingAssistantId}
              showTelemetry={showTelemetry}
              showCitations={showCitations}
              showPlaceholder={false}
              citationLinkLength={24}
            />
          </div>
        </div>

        <ChatInputBar
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          onStop={abortActiveRequest}
          isLoading={isLoading}
          inputRef={inputRef}
          placeholder="Ask me anything about Jack..."
        />
      </div>
    </>
  );
}
