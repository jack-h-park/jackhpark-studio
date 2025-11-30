"use client";

import { AiOutlineArrowsAlt } from "@react-icons/all-files/ai/AiOutlineArrowsAlt";
import { AiOutlineClose } from "@react-icons/all-files/ai/AiOutlineClose";
import { AiOutlineCompress } from "@react-icons/all-files/ai/AiOutlineCompress";
import { AiOutlineSend } from "@react-icons/all-files/ai/AiOutlineSend";
import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { GiBrain } from "@react-icons/all-files/gi/GiBrain";
import {
  type ChangeEvent,
  type FormEvent,
  type JSX,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ModelResolutionReason } from "@/types/chat-config";
import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { Switch } from "@/components/ui/switch";
import {
  deserializeGuardrailMeta,
  type GuardrailMeta,
} from "@/lib/shared/guardrail-meta";
import {
  type ChatEngine,
  MODEL_PROVIDER_LABELS,
  type ModelProvider,
} from "@/lib/shared/model-provider";
import { type RankerMode, type ReverseRagMode } from "@/lib/shared/rag-config";

import styles from "./ChatWindow.module.css";

const URL_REGEX = /(https?:\/\/[^\s<>()"'`]+[^\s.,)<>"'`])/gi;

function formatLinkLabel(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const path =
      parsed.pathname && parsed.pathname !== "/"
        ? parsed.pathname.length > 24
          ? `${parsed.pathname.slice(0, 24)}…`
          : parsed.pathname
        : "";
    return `${parsed.hostname}${path}`;
  } catch {
    return "Open link";
  }
}

function withLineBreaks(text: string, keyPrefix: string): JSX.Element[] {
  return text.split("\n").flatMap((line, index, array) => {
    const nodes: JSX.Element[] = [
      <span key={`${keyPrefix}-line-${index}`}>{line}</span>,
    ];
    if (index < array.length - 1) {
      nodes.push(<br key={`${keyPrefix}-br-${index}`} />);
    }
    return nodes;
  });
}

function renderMessageContent(
  content: string,
  keyPrefix: string,
): JSX.Element[] {
  const nodes: JSX.Element[] = [];
  const regex = new RegExp(URL_REGEX);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        ...withLineBreaks(
          content.slice(lastIndex, match.index),
          `${keyPrefix}-text-${lastIndex}`,
        ),
      );
    }

    const url = match[0];
    nodes.push(
      <a
        key={`${keyPrefix}-link-${match.index}`}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        title={url}
      >
        {formatLinkLabel(url)}
      </a>,
    );

    lastIndex = match.index + url.length;
  }

  if (lastIndex < content.length) {
    nodes.push(
      ...withLineBreaks(content.slice(lastIndex), `${keyPrefix}-text-tail`),
    );
  }

  return nodes;
}
export type ChatWindowProps = {
  isOpen: boolean;
  showExpandButton?: boolean;
  showCloseButton?: boolean;
  onClose?: () => void;
  headerAction?: JSX.Element | null;
};
type Citation = { title?: string; source_url?: string; excerpt_count?: number };

const mergeCitations = (entries: Citation[]): Citation[] => {
  const merged = new Map<
    string,
    { title?: string; source_url?: string; excerpt_count: number }
  >();

  let index = 0;
  for (const entry of entries) {
    const urlKey = entry.source_url?.trim().toLowerCase();
    const docKey = entry.title?.trim().toLowerCase();
    const fallbackKey = `idx:${index}`;
    const key =
      urlKey && urlKey.length > 0
        ? urlKey
        : docKey && docKey.length > 0
          ? docKey
          : fallbackKey;

    const existing = merged.get(key);
    if (existing) {
      existing.excerpt_count += entry.excerpt_count ?? 1;
      if (!existing.title && entry.title) {
        existing.title = entry.title;
      }
      if (!existing.source_url && entry.source_url) {
        existing.source_url = entry.source_url;
      }
    } else {
      merged.set(key, {
        title: entry.title,
        source_url: entry.source_url,
        excerpt_count: entry.excerpt_count ?? 1,
      });
    }
    index += 1;
  }

  return Array.from(merged.values());
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: GuardrailMeta | null;
  citations?: Citation[];
  runtime?: ChatRuntimeConfig;
};

type ChatResponse = {
  answer: string;
  citations: Citation[];
};

type ChatRuntimeConfig = {
  engine: ChatEngine;
  llmProvider: ModelProvider;
  embeddingProvider: ModelProvider;
  llmModelId: string | null;
  requestedLlmModelId?: string | null;
  resolvedLlmModelId?: string | null;
  llmModelWasSubstituted?: boolean;
  llmSubstitutionReason?: ModelResolutionReason;
  embeddingModelId: string | null;
  embeddingSpaceId: string | null;
  llmModel?: string | null;
  embeddingModel?: string | null;
  reverseRagEnabled: boolean;
  reverseRagMode: ReverseRagMode;
  hydeEnabled: boolean;
  rankerMode: RankerMode;
};

const truncateText = (value: string | null | undefined, max = 60) => {
  if (!value) return "";
  return value.length <= max ? value : `${value.slice(0, max)}…`;
};

const CITATIONS_SEPARATOR = `\n\n--- begin citations ---\n`;
const DEBUG_LANGCHAIN_STREAM =
  process.env.NEXT_PUBLIC_DEBUG_LANGCHAIN_STREAM === "true";

class ChatRequestError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ChatRequestError";
    this.status = status;
  }
}

const NETWORK_ERROR_MESSAGE =
  "Unable to reach the chat service. Check your network connection or restart the dev server and try again.";

const isLikelyNetworkError = (message: string) =>
  [
    "Failed to fetch",
    "NetworkError",
    "Connection error",
    "TypeError: NetworkError",
    "TypeError: Failed to fetch",
    "Load failed",
  ].some((fragment) => message.toLowerCase().includes(fragment.toLowerCase()));

const parseErrorPayload = (raw?: string | null) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const candidate = parsed as { error?: unknown; message?: unknown };
      if (typeof candidate.error === "string") return candidate.error;
      if (typeof candidate.message === "string") return candidate.message;
    }
  } catch {
    // Swallow JSON parse errors and fall back to the raw text.
  }
  return trimmed;
};

const buildResponseError = async (response: Response) => {
  const fallback = `Request failed with status ${response.status}`;
  try {
    const raw = await response.text();
    return new ChatRequestError(
      parseErrorPayload(raw) ?? fallback,
      response.status,
    );
  } catch {
    return new ChatRequestError(fallback, response.status);
  }
};

const getUserFacingErrorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The request was cancelled.";
  }

  if (error instanceof ChatRequestError) {
    const message = error.message || NETWORK_ERROR_MESSAGE;
    if (isLikelyNetworkError(message)) {
      return NETWORK_ERROR_MESSAGE;
    }
    return message;
  }

  if (error instanceof Error) {
    if (isLikelyNetworkError(error.message)) {
      return NETWORK_ERROR_MESSAGE;
    }
    return error.message || "Something went wrong.";
  }

  if (typeof error === "string" && isLikelyNetworkError(error)) {
    return NETWORK_ERROR_MESSAGE;
  }

  return "Something went wrong while sending your message. Please try again.";
};

export function ChatWindow({
  isOpen,
  showCloseButton = true,
  showExpandButton = true,
  onClose,
  headerAction,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const [runtimeConfig, setRuntimeConfig] = useState<ChatRuntimeConfig | null>(
    null,
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const {
    showTelemetry,
    telemetryAutoExpand,
    showCitations,
    setShowTelemetry: setDisplayShowTelemetry,
    setTelemetryAutoExpand: setDisplayTelemetryAutoExpand,
    setShowCitations: setDisplayShowCitations,
  } = useChatDisplaySettings();
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);
  const [loadingAssistantId, setLoadingAssistantId] = useState<string | null>(
    null,
  );
  const loadingAssistantRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadRuntime = async () => {
      try {
        const response = await fetch("/api/chat-runtime", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to load chat runtime (${response.status})`);
        }
        const payload = (await response.json()) as {
          runtime?: ChatRuntimeConfig | null;
        };
        if (payload?.runtime) {
          setRuntimeConfig(payload.runtime);
        } else {
          console.warn(
            "[ChatWindow] chat runtime payload missing; telemetry disabled",
          );
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn(
            "[ChatWindow] failed to load chat runtime; telemetry limited",
            err,
          );
        }
      }
    };

    void loadRuntime();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    loadingAssistantRef.current = loadingAssistantId;
  }, [loadingAssistantId]);

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

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = input.trim();

    if (!value || isLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: value,
    };

    const assistantMessageId = `assistant-${Date.now()}`;

    setMessages((prev) => {
      if (!isMountedRef.current) {
        return prev;
      }

      setLoadingAssistantId(assistantMessageId);
      return [
        ...prev,
        userMessage,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          runtime: runtimeConfig ?? undefined,
        },
      ];
    });
    setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const updateAssistant = (
      content?: string,
      meta?: GuardrailMeta | null,
      citations?: ChatResponse["citations"],
    ) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content:
                  typeof content === "string" ? content : message.content,
                ...(meta !== undefined ? { meta } : {}),
                ...(citations !== undefined ? { citations } : {}),
              }
            : message,
        ),
      );
    };

    const run = async () => {
      try {
        const activeRuntime = runtimeConfig;
        const runtimeEngine = activeRuntime?.engine ?? "lc";
        const endpoint = `/api/chat`;
        const sanitizedMessagesPayload = [...messages, userMessage].map(
          (message) => ({
            role: message.role,
            content: message.content,
          }),
        );

        if (runtimeEngine === "lc") {
          // LangChain streaming
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: value,
              messages: sanitizedMessagesPayload,
            }),
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            throw await buildResponseError(response);
          }

          const guardrailMeta = deserializeGuardrailMeta(
            response.headers.get("x-guardrail-meta"),
          );
          if (guardrailMeta) {
            updateAssistant(undefined, guardrailMeta);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullContent = "";
          let clientChunkIndex = 0;

          let done = false;
          while (!done) {
            const result = await reader.read();
            done = result.done ?? false;
            const chunk = result.value;
            if (!chunk) continue;

            const chunkText = decoder.decode(chunk, { stream: !done });
            if (
              loadingAssistantRef.current === assistantMessageId &&
              chunkText.trim().length > 0
            ) {
              setLoadingAssistantId(null);
            }
            fullContent += chunkText;
            clientChunkIndex += 1;
            if (DEBUG_LANGCHAIN_STREAM) {
              // eslint-disable-next-line unicorn/prefer-string-replace-all
              const preview = chunkText.replace(/\s+/g, " ").trim();
              console.debug(
                `[langchain_chat:client] chunk ${clientChunkIndex} (${chunkText.length} chars): ${
                  preview.length > 0 ? preview.slice(0, 40) : "<empty>"
                }`,
              );
            }
            if (!isMountedRef.current) return;

            const [answer] = fullContent.split(CITATIONS_SEPARATOR);
            updateAssistant(answer);
          }

          const [answer, citationsJson] =
            fullContent.split(CITATIONS_SEPARATOR);
          const finalContent = (answer ?? "").trim();
          let parsedCitations: ChatResponse["citations"] = [];

          if (citationsJson) {
            try {
              const candidate = JSON.parse(citationsJson);
              if (Array.isArray(candidate)) {
                parsedCitations = candidate as ChatResponse["citations"];
              }
            } catch {
              // ignore json parse errors
            }
          }

          if (isMountedRef.current) {
            updateAssistant(finalContent, guardrailMeta, parsedCitations);
          }
        } else {
          // Native streaming
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: sanitizedMessagesPayload,
            }),
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            throw await buildResponseError(response);
          }

          const guardrailMeta = deserializeGuardrailMeta(
            response.headers.get("x-guardrail-meta"),
          );
          if (guardrailMeta) {
            updateAssistant(undefined, guardrailMeta);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let assistantContent = "";

          let done = false;
          while (!done) {
            const result = await reader.read();
            done = result.done ?? false;
            const chunk = result.value;
            if (!chunk) continue;

            const decodedChunk = decoder.decode(chunk, { stream: !done });
            if (
              loadingAssistantRef.current === assistantMessageId &&
              decodedChunk.trim().length > 0
            ) {
              setLoadingAssistantId(null);
            }
            console.debug("[chat-panel] chunk", {
              engine: runtimeEngine,
              length: decodedChunk.length,
            });
            assistantContent += decodedChunk;
            if (!isMountedRef.current) return;

            updateAssistant(assistantContent, guardrailMeta);
          }
        }
      } catch (err) {
        console.error("Chat request failed", err);
        if (controller.signal.aborted || !isMountedRef.current) {
          return;
        }
        const message = getUserFacingErrorMessage(err);
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantMessageId
              ? { ...item, content: `Warning: ${message}` }
              : item,
          ),
        );
      } finally {
        abortControllerRef.current = null;
        setLoadingAssistantId(null);
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    void run();
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
          {messages.map((m) => {
            const mergedCitations =
              m.citations && m.citations.length > 0
                ? mergeCitations(m.citations)
                : null;
            const contextStats = m.meta?.context;
            const totalExcerptsRaw =
              contextStats?.retrieved ??
              (typeof contextStats?.included === "number" &&
              typeof contextStats?.dropped === "number"
                ? contextStats.included + contextStats.dropped
                : null);
            const totalExcerpts =
              totalExcerptsRaw !== null && totalExcerptsRaw !== undefined
                ? Math.max(totalExcerptsRaw, contextStats?.included ?? 0)
                : null;
            const contextUsageLabel =
              contextStats && totalExcerpts !== null && totalExcerpts > 0
                ? `${contextStats.included} used out of ${totalExcerpts} excerpts`
                : contextStats
                  ? `${contextStats.included} excerpts`
                  : null;
            const contextTokensLabel = contextStats
              ? `(${contextStats.totalTokens}${
                  contextStats.contextTokenBudget
                    ? ` / ${contextStats.contextTokenBudget}`
                    : ""
                } tokens)`
              : null;
            const similarityThreshold =
              contextStats &&
              typeof contextStats.similarityThreshold === "number"
                ? contextStats.similarityThreshold
                : null;
            const highestSimilarity =
              contextStats && typeof contextStats.highestSimilarity === "number"
                ? contextStats.highestSimilarity
                : null;
            const historyStats = m.meta?.history;
            const historyLabel = historyStats
              ? `${historyStats.tokens} / ${historyStats.budget} tokens${
                  historyStats.trimmedTurns > 0
                    ? ` (${historyStats.trimmedTurns} trimmed)`
                    : ""
                }`
              : typeof m.meta?.historyTokens === "number"
                ? `${m.meta.historyTokens} tokens`
                : null;
            const historyTokensCount =
              historyStats?.tokens ?? m.meta?.historyTokens ?? null;
            const historyBudgetCount = historyStats?.budget ?? null;
            const summaryInfo = m.meta?.summaryInfo;
            const summaryConfig = m.meta?.summaryConfig;
            const summaryTriggerTokens = summaryConfig?.triggerTokens ?? null;
            const showSummaryBlock = Boolean(summaryConfig?.enabled);
            const historySummaryLabel =
              historyTokensCount !== null && summaryTriggerTokens !== null
                ? `History not summarized (${historyTokensCount} / ${summaryTriggerTokens} tokens)`
                : historyTokensCount !== null && historyBudgetCount !== null
                  ? `History not summarized (${historyTokensCount} / ${historyBudgetCount} tokens)`
                  : historyTokensCount !== null
                    ? `History not summarized (${historyTokensCount} tokens)`
                    : "History not summarized";
            const runtimeEngineLabel =
              m.runtime?.engine === "lc"
                ? "LangChain"
                : m.runtime?.engine === "native"
                  ? "Native"
                  : null;
            const runtimeLlmProviderLabel = m.runtime
              ? m.runtime.llmProvider === "openai"
                ? "Open AI"
                : MODEL_PROVIDER_LABELS[m.runtime.llmProvider]
              : null;
            const runtimeLlmModelLabel =
              m.runtime?.resolvedLlmModelId ??
              m.runtime?.llmModelId ??
              m.runtime?.llmModel ??
              null;
            const runtimeLlmDisplay =
              runtimeLlmProviderLabel && runtimeLlmModelLabel
                ? `${runtimeLlmProviderLabel} / ${runtimeLlmModelLabel}`
                : (runtimeLlmModelLabel ?? runtimeLlmProviderLabel);
            const runtimeEmbeddingModelLabel =
              m.runtime?.embeddingModelId ?? m.runtime?.embeddingModel ?? null;
            const hasRuntime = Boolean(
              runtimeEngineLabel ||
                runtimeLlmDisplay ||
                runtimeEmbeddingModelLabel,
            );
            const hasGuardrailMeta = Boolean(contextStats);
            const enhancements = m.meta?.enhancements;
            const hasEnhancements = Boolean(enhancements);
            const telemetryActive = showTelemetry && telemetryExpanded;
            const showRuntimeCard = telemetryActive && hasRuntime;
            const showGuardrailCards = telemetryActive && contextStats;
            const showEnhancementCard = telemetryActive && hasEnhancements;
            const hasAnyMeta =
              hasRuntime || hasGuardrailMeta || hasEnhancements;
            const isStreamingAssistant =
              m.role === "assistant" &&
              isLoading &&
              loadingAssistantId === m.id;

            return (
              <div key={m.id} className={styles.messageGroup}>
                <div
                  className={`${styles.message} ${styles[m.role]} ${
                    isStreamingAssistant ? styles.isLoading : ""
                  }`}
                >
                  {typeof m.content === "string"
                    ? renderMessageContent(m.content, m.id)
                    : m.content}
                  {isStreamingAssistant && (
                    <div className={styles.assistantLoadingIndicator}>
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                </div>
                {m.role === "assistant" && hasAnyMeta && (
                  <div className={styles.messageMeta}>
                    {showTelemetry && (
                      <div className={styles.telemetryCollapseRow}>
                        <button
                          type="button"
                          className={styles.telemetryCollapseBtn}
                          onClick={toggleTelemetryExpanded}
                        >
                          {telemetryExpanded
                            ? "Hide telemetry details"
                            : "Show telemetry details"}
                        </button>
                      </div>
                    )}
                    {showRuntimeCard && (
                      <div
                        className={`${styles.metaCard} ${styles.metaCardRuntime}`}
                      >
                        <div className={styles.metaCardHeading}>
                          Engine &amp; Model
                        </div>
                        <div className={styles.metaCardGrid}>
                          {runtimeEngineLabel && (
                            <div className={styles.metaCardBlock}>
                              <div className={styles.metaCardBlockLabel}>
                                ENGINE
                              </div>
                              <div className={styles.metaCardBlockValue}>
                                {runtimeEngineLabel}
                              </div>
                            </div>
                          )}
                          {runtimeLlmDisplay && (
                            <div className={styles.metaCardBlock}>
                              <div className={styles.metaCardBlockLabel}>
                                LLM
                              </div>
                              <div className={styles.metaCardBlockValue}>
                                {runtimeLlmDisplay}
                              </div>
                            </div>
                          )}
                          {runtimeEmbeddingModelLabel && (
                            <div className={styles.metaCardBlock}>
                              <div className={styles.metaCardBlockLabel}>
                                EMBEDDING
                              </div>
                              <div className={styles.metaCardBlockValue}>
                                {runtimeEmbeddingModelLabel}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {showGuardrailCards && (
                      <div
                        className={`${styles.metaCard} ${styles.metaCardGuardrail}`}
                      >
                        <div className={styles.metaCardHeading}>Guardrails</div>
                        <div className={styles.metaCardGrid}>
                          <div className={styles.metaCardBlock}>
                            <div className={styles.metaCardBlockLabel}>
                              ROUTE
                            </div>
                            <div className={styles.metaCardBlockValue}>
                              {m.meta!.reason ?? m.meta!.intent}
                            </div>
                          </div>
                          <div className={styles.metaCardBlock}>
                            <div className={styles.metaCardBlockLabel}>
                              CONTEXT
                            </div>
                            <div
                              className={`${styles.metaCardBlockValue} ${contextStats.insufficient ? styles.warning : ""}`}
                            >
                              {contextUsageLabel}
                              {contextTokensLabel
                                ? ` ${contextTokensLabel}`
                                : ""}
                            </div>
                          </div>
                          {historyLabel && (
                            <div className={styles.metaCardBlock}>
                              <div className={styles.metaCardBlockLabel}>
                                HISTORY
                              </div>
                              <div className={styles.metaCardBlockValue}>
                                {historyLabel}
                              </div>
                            </div>
                          )}
                          {similarityThreshold !== null && (
                            <div className={styles.metaCardBlock}>
                              <div className={styles.metaCardBlockLabel}>
                                SIMILARITY
                              </div>
                              <div
                                className={`${styles.metaCardBlockValue} ${contextStats.insufficient ? styles.warning : ""}`}
                              >
                                {highestSimilarity !== null
                                  ? highestSimilarity.toFixed(3)
                                  : "—"}{" "}
                                / min {similarityThreshold.toFixed(2)}
                                {contextStats.insufficient
                                  ? " (Insufficient)"
                                  : ""}
                              </div>
                            </div>
                          )}
                        </div>
                        {showSummaryBlock && (
                          <div
                            className={`${styles.metaCardBlock} ${styles.metaCardBlockSummary}`}
                          >
                            <div className={styles.metaCardBlockLabel}>
                              SUMMARY
                            </div>
                            <div className={styles.metaCardBlockValue}>
                              {summaryInfo
                                ? `History summarized (${summaryInfo.originalTokens} → ${summaryInfo.summaryTokens} tokens)`
                                : historySummaryLabel}
                            </div>
                            {summaryInfo ? (
                              <div className={styles.metaCardBlockSecondary}>
                                {summaryInfo.trimmedTurns} of{" "}
                                {summaryInfo.maxTurns} turns summarized
                              </div>
                            ) : null}
                          </div>
                        )}
                        {m.meta?.summaryApplied && (
                          <div className={styles.metaCardFooter}>
                            <span className={styles.metaChip}>
                              Summary applied
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {showEnhancementCard && (
                      <div
                        className={`${styles.metaCard} ${styles.metaCardEnhancements}`}
                      >
                        <div className={styles.metaCardHeading}>
                          Enhancements
                        </div>
                        <div className={styles.metaCardGrid}>
                          <div className={styles.metaCardBlock}>
                            <div className={styles.metaCardBlockLabel}>
                              REVERSE RAG
                            </div>
                            <div
                              className={`${styles.metaCardBlockValue} ${styles.enhancementChip}`}
                              data-tooltip={
                                enhancements?.reverseRag
                                  ? `mode: ${enhancements.reverseRag.mode}\noriginal: ${enhancements.reverseRag.original}\nrewritten: ${enhancements.reverseRag.rewritten}`
                                  : ""
                              }
                            >
                              {enhancements?.reverseRag?.enabled
                                ? enhancements.reverseRag.mode
                                : "off"}
                            </div>
                            {enhancements?.reverseRag?.enabled && (
                              <div className={styles.metaCardBlockSecondary}>
                                {`original: ${truncateText(enhancements.reverseRag.original, 40)}`}
                                <br />
                                {`rewritten: ${truncateText(enhancements.reverseRag.rewritten, 40)}`}
                              </div>
                            )}
                          </div>
                          <div className={styles.metaCardBlock}>
                            <div className={styles.metaCardBlockLabel}>
                              HyDE
                            </div>
                            <div
                              className={`${styles.metaCardBlockValue} ${styles.enhancementChip}`}
                              data-tooltip={enhancements?.hyde?.generated ?? ""}
                            >
                              {enhancements?.hyde?.enabled
                                ? enhancements.hyde.generated
                                  ? truncateText(
                                      enhancements.hyde.generated,
                                      40,
                                    )
                                  : "generated"
                                : "off"}
                            </div>
                          </div>
                          <div className={styles.metaCardBlock}>
                            <div className={styles.metaCardBlockLabel}>
                              RANKER
                            </div>
                            <div className={styles.metaCardBlockValue}>
                              {enhancements?.ranker?.mode ?? "none"}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {m.role === "assistant" &&
                  showCitations &&
                  mergedCitations &&
                  mergedCitations.length > 0 && (
                    <ol className={styles.messageCitations}>
                      {mergedCitations.map((citation, index) => {
                        const title =
                          (citation.title ?? "").trim() ||
                          (citation.source_url ?? "").trim() ||
                          `Source ${index + 1}`;
                        const url = (citation.source_url ?? "").trim();
                        const excerptCount =
                          typeof citation.excerpt_count === "number"
                            ? citation.excerpt_count
                            : 1;
                        const countLabel =
                          excerptCount > 1 ? `${excerptCount} excerpts` : null;
                        return (
                          <li key={`${m.id}-citation-${index}`}>
                            {title}
                            {url && (
                              <>
                                {" "}
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                >
                                  {formatLinkLabel(url)}
                                </a>
                              </>
                            )}
                            {countLabel && (
                              <span className={styles.citationCount}>
                                ({countLabel})
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        <form className={styles.chatInputForm} onSubmit={handleFormSubmit}>
          <input
            className={styles.chatInput}
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            placeholder="Ask me anything about Jack..."
            disabled={isLoading}
          />
          <button
            type="submit"
            className={styles.chatSubmitButton}
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
          >
            <AiOutlineSend size={20} />
          </button>
        </form>
      </div>
    </>
  );
}
