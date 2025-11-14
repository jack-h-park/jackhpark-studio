"use client";

import { AiOutlineArrowsAlt } from "@react-icons/all-files/ai/AiOutlineArrowsAlt";
import { AiOutlineClose } from "@react-icons/all-files/ai/AiOutlineClose";
import { AiOutlineCompress } from "@react-icons/all-files/ai/AiOutlineCompress";
import { AiOutlineSend } from "@react-icons/all-files/ai/AiOutlineSend";
import { FcAssistant } from "@react-icons/all-files/fc/FcAssistant";
import { GiBrain } from "@react-icons/all-files/gi/GiBrain";
import {
  type ChangeEvent,
  type FormEvent,
  type JSX,
  useEffect,
  useRef,
  useState,
} from "react";
import css from "styled-jsx/css";

import {
  deserializeGuardrailMeta,
  type GuardrailMeta,
} from "@/lib/shared/guardrail-meta";
import {
  MODEL_PROVIDER_LABELS,
  MODEL_PROVIDERS,
  type ModelProvider,
  normalizeModelProvider,
} from "@/lib/shared/model-provider";

const DEFAULT_MODEL_PROVIDER: ModelProvider = normalizeModelProvider(
  process.env.NEXT_PUBLIC_LLM_PROVIDER ?? null,
  "openai",
);

const URL_REGEX =
  /(https?:\/\/[^\s<>()"'`]+[^\s.,)<>"'`])/gi;

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
      ...withLineBreaks(
        content.slice(lastIndex),
        `${keyPrefix}-text-tail`,
      ),
    );
  }

  return nodes;
}
const styles = css`
  .chat-panel-container {
    position: fixed;
    bottom: 60px;
    right: 30px;
    z-index: 1000;
  }

  .chat-panel-button {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s ease-in-out;
  }

  .chat-panel-button:hover {
    transform: scale(1.1);
  }

  .chat-panel-button :global(svg) {
    width: 36px;
    height: 36px;
    color: #0a4584ff;
  }

  .chat-panel {
    position: absolute;
    bottom: 88px;
    right: 0;
    width: 375px;
    height: 550px;
    max-height: calc(100vh - 140px);
    background: #f9f9f9;
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    opacity: 0;
    transform: translateY(20px);
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;
    pointer-events: none;
  }

  .chat-panel.is-open {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .chat-panel.is-large {
    width: 600px;
    height: 640px;
    max-height: calc(100vh - 100px);
  }

  .chat-header {
    padding: 16px;
    background: #fff;
    border-bottom: 1px solid #eee;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex-shrink: 0;
  }

  .chat-header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .chat-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chat-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chat-header-title :global(svg) {
    width: 20px;
    height: 20px;
    color: #0a4584;
  }

  .chat-config-toggle {
    background: #f0f4ff;
    color: #0a4584;
    border: 1px solid #d0dbff;
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .chat-config-toggle:hover {
    background: #e3eaff;
  }

  .chat-config-bar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #f4f6fb;
    border: 1px solid #e3e7f2;
    border-radius: 12px;
    padding: 14px;
    margin-top: 12px;
  }

  .chat-control-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chat-control-label {
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #4f5a7d;
  }

  .chat-engine-toggle {
    display: flex;
    padding: 4px;
    border-radius: 10px;
    background: #fff;
    border: 1px solid #d3d8ee;
    gap: 4px;
  }

  .chat-engine-toggle button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #4a4f68;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .chat-engine-toggle button[aria-pressed="true"] {
    background: #0a4584;
    color: #fff;
    box-shadow: 0 2px 6px rgba(10, 69, 132, 0.2);
  }

  .chat-engine-toggle button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .chat-provider-select {
    border: 1px solid #d3d8ee;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 0.82rem;
    background: #fff;
    color: #1f2937;
    width: 100%;
    min-height: 34px;
  }

  .chat-provider-select:focus {
    outline: none;
    border-color: #007aff;
    box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
  }

  .guardrail-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: #fff;
    border: 1px solid #d3d8ee;
    border-radius: 10px;
    padding: 10px 12px;
  }

  .guardrail-description {
    flex: 1;
    font-size: 0.8rem;
    color: #374151;
  }

  .toggle-switch {
    position: relative;
    display: inline-flex;
    width: 42px;
    height: 22px;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: #d1d5db;
    transition: 0.2s;
    border-radius: 999px;
  }

  .toggle-slider::before {
    position: absolute;
    content: '';
    height: 18px;
    width: 18px;
    left: 2px;
    top: 2px;
    background-color: #fff;
    transition: 0.2s;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .toggle-switch input:checked + .toggle-slider {
    background-color: #0a4584;
  }

  .toggle-switch input:checked + .toggle-slider::before {
    transform: translateX(20px);
  }

  .chat-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .chat-close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: #555;
  }

  .chat-expand-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #555;
    transition: color 0.2s ease;
  }

  .chat-close-button:hover,
  .chat-expand-button:hover {
    color: #000;
  }

  .chat-messages {
    flex-grow: 1;
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .message {
    padding: 10px 14px;
    border-radius: 18px;
    max-width: 80%;
    line-height: 1.5;
    font-size: 0.9rem;
  }

  .message a {
    color: #1d4ed8;
    text-decoration: underline;
    word-break: break-word;
  }

  .message a:hover,
  .message a:focus {
    color: #0f172a;
  }

  .message.user {
    background: #007aff;
    color: white;
    align-self: flex-end;
    border-bottom-right-radius: 4px;
  }

  .message.assistant {
    background: #e5e5ea;
    color: #000;
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }

  .message-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .message-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }

  .meta-chip {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 3px 6px;
    border-radius: 999px;
    background: rgba(10, 69, 132, 0.1);
    color: #0a4584;
  }

  .meta-chip.warning {
    background: rgba(255, 140, 0, 0.15);
    color: #b45309;
  }

  .meta-debug {
    margin-top: 6px;
    padding: 8px;
    border-radius: 8px;
    background: #fff;
    border: 1px solid #e0e7ff;
    font-size: 0.75rem;
    color: #374151;
    line-height: 1.3;
  }

  .chat-input-form {
    display: flex;
    padding: 16px;
    border-top: 1px solid #eee;
    background: #fff;
    flex-shrink: 0;
  }

  .chat-input {
    flex-grow: 1;
    border: 1px solid #ddd;
    border-radius: 20px;
    padding: 10px 16px;
    font-size: 0.9rem;
    margin-right: 8px;
  }

  .chat-input:focus {
    outline: none;
    border-color: #007aff;
  }

  .chat-submit-button {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: #007aff;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .chat-submit-button:disabled {
    background: #ccc;
  }

  @media (max-width: 480px) {
    .chat-panel-container {
      bottom: 24px;
      right: 16px;
    }
    .chat-panel {
      width: calc(100vw - 32px);
      height: 70vh;
      bottom: 80px;
    }
    .chat-panel.is-large {
      width: calc(100vw - 32px);
      height: 72vh;
    }
  }
`;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: GuardrailMeta | null;
};

type ChatResponse = {
  answer: string;
  citations: Array<{ title?: string; source_url?: string }>;
};

type Engine = "native" | "lc";

const CITATIONS_SEPARATOR = `\n\n--- begin citations ---\n`;

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
    const parsed = JSON.parse(trimmed);
    if (typeof parsed?.error === "string") return parsed.error;
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    // Swallow JSON parse errors and fall back to the raw text.
  }
  return trimmed;
};

const buildResponseError = async (response: Response) => {
  const fallback = `Request failed with status ${response.status}`;
  try {
    const raw = await response.text();
    return new ChatRequestError(parseErrorPayload(raw) ?? fallback, response.status);
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

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const [engine, setEngine] = useState<Engine>("lc");
  const [provider, setProvider] = useState<ModelProvider>(
    DEFAULT_MODEL_PROVIDER,
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? (localStorage.getItem("ask_engine") as Engine | null)
        : null;
    if (saved === "native" || saved === "lc") setEngine(saved);
  }, []);

  const setEngineAndSave = (next: Engine) => {
    setEngine(next);
    if (typeof window !== "undefined") localStorage.setItem("ask_engine", next);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = localStorage.getItem("ask_provider");
    if (stored) {
      setProvider(normalizeModelProvider(stored, DEFAULT_MODEL_PROVIDER));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = localStorage.getItem("chat_guardrail_debug");
    setShowDiagnostics(stored === "1");
  }, []);

  const setProviderAndSave = (next: ModelProvider) => {
    setProvider(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("ask_provider", next);
    }
  };

  const toggleDiagnostics = () => {
    setShowDiagnostics((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("chat_guardrail_debug", next ? "1" : "0");
      }
      return next;
    });
  };

  const toggleOptions = () => {
    setShowOptions((prev) => !prev);
  };

  const focusInput = () => {
    if (!isOpen) {
      return;
    }
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

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
  }, [isOpen]);

  useEffect(() => {
    if (!isLoading) {
      focusInput();
    }
  }, [isLoading]);

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

      return [
        ...prev,
        userMessage,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
        },
      ];
    });
    setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const updateAssistant = (content?: string, meta?: GuardrailMeta | null) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content:
                  typeof content === "string" ? content : message.content,
                ...(meta !== undefined ? { meta } : {}),
              }
            : message,
        ),
      );
    };

    const run = async () => {
      try {
        const endpoint = `/api/chat?engine=${engine}`;
        const sanitizedMessagesPayload = [...messages, userMessage].map(
          (message) => ({
            role: message.role,
            content: message.content,
          }),
        );

        if (engine === "lc") {
          // LangChain streaming
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: value,
              messages: sanitizedMessagesPayload,
              provider,
              embeddingProvider: provider,
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

          let done = false;
          while (!done) {
            const result = await reader.read();
            done = result.done ?? false;
            const chunk = result.value;
            if (!chunk) continue;

            fullContent += decoder.decode(chunk, { stream: !done });
            if (!isMountedRef.current) return;

            const [answer] = fullContent.split(CITATIONS_SEPARATOR);
            updateAssistant(answer);
          }

          const [answer, citationsJson] =
            fullContent.split(CITATIONS_SEPARATOR);
          let finalContent = answer;

          if (citationsJson) {
            try {
              const citations = JSON.parse(
                citationsJson,
              ) as ChatResponse["citations"];
              const citesText =
                citations
                  .filter((c) => c?.title || c?.source_url)
                  .map((c, i) =>
                    `(${i + 1}) ${c.title ?? ""} ${c.source_url ?? ""}`.trim(),
                  )
                  .join("\n") || "";
              if (citesText) {
                finalContent = `${answer.trim()}\n\n${citesText}`;
              }
            } catch {
              // ignore json parse errors
            }
          }

          if (isMountedRef.current) {
            updateAssistant(finalContent, guardrailMeta);
          }
        } else {
          // Native streaming
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: sanitizedMessagesPayload,
              provider,
              embeddingProvider: provider,
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

            assistantContent += decoder.decode(chunk, { stream: !done });
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
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    void run();
  };

  return (
    <>
      <style jsx>{styles}</style>
      <div className="chat-panel-container">
        <div
          className={`chat-panel ${isOpen ? "is-open" : ""} ${
            isExpanded ? "is-large" : ""
          }`}
        >
          <header className="chat-header">
            <div className="chat-header-top">
              <div className="chat-header-title">
                <GiBrain />
                <h3>Jack's AI Assistant</h3>
              </div>
              <div className="chat-header-actions">
                <button
                  type="button"
                  className="chat-config-toggle"
                  onClick={toggleOptions}
                >
                  {showOptions ? "Hide Options" : "Show Options"}
                </button>
                <button
                  type="button"
                  className="chat-expand-button"
                  aria-label={isExpanded ? "Shrink chat panel" : "Expand chat panel"}
                  onClick={togglePanelSize}
                >
                  {isExpanded ? (
                    <AiOutlineCompress size={16} />
                  ) : (
                    <AiOutlineArrowsAlt size={16} />
                  )}
                </button>
                <button
                  className="chat-close-button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close chat"
                >
                  <AiOutlineClose size={20} />
                </button>
              </div>
            </div>
            {showOptions && (
              <div className="chat-config-bar">
                <div className="chat-control-block" role="group">
                  <span className="chat-control-label">Engine</span>
                  <div className="chat-engine-toggle">
                    <button
                      type="button"
                      onClick={() => setEngineAndSave("native")}
                      aria-pressed={engine === "native"}
                      aria-label="Switch to native engine"
                      disabled={isLoading}
                    >
                      Native
                    </button>
                    <button
                      type="button"
                      onClick={() => setEngineAndSave("lc")}
                      aria-pressed={engine === "lc"}
                      aria-label="Switch to LangChain engine"
                      disabled={isLoading}
                    >
                      LangChain
                    </button>
                  </div>
                </div>
                <div className="chat-control-block">
                  <span className="chat-control-label">Model</span>
                  <select
                    className="chat-provider-select"
                    value={provider}
                    onChange={(event) =>
                      setProviderAndSave(event.target.value as ModelProvider)
                    }
                    disabled={isLoading}
                    aria-label="Model provider"
                  >
                    {MODEL_PROVIDERS.map((option) => (
                      <option key={option} value={option}>
                        {MODEL_PROVIDER_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="chat-control-block">
                  <span className="chat-control-label">Guardrail telemetry</span>
                  <div className="guardrail-toggle-row">
                    <span className="guardrail-description">
                      Show intent, context, and summary badges
                    </span>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={showDiagnostics}
                        onChange={toggleDiagnostics}
                        aria-label="Toggle guardrail telemetry visibility"
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </header>

          <div className="chat-messages">
            {messages.map((m) => (
              <div key={m.id} className="message-group">
                <div className={`message ${m.role}`}>
                  {typeof m.content === "string"
                    ? renderMessageContent(m.content, m.id)
                    : m.content}
                </div>
                {m.role === "assistant" && m.meta && (
                  <>
                    <div className="message-meta">
                      <span className="meta-chip">
                        Intent: {m.meta.intent}
                      </span>
                      <span
                        className={`meta-chip ${
                          m.meta.context.insufficient ? "warning" : ""
                        }`}
                      >
                        Context: {m.meta.context.included} kept ·{" "}
                        {m.meta.context.totalTokens} tokens
                      </span>
                      {m.meta.summaryApplied && (
                        <span className="meta-chip">Summary applied</span>
                      )}
                    </div>
                    {showDiagnostics && (
                      <div className="meta-debug">
                        <div>Reason: {m.meta.reason}</div>
                        <div>History tokens: {m.meta.historyTokens}</div>
                        <div>
                          Dropped excerpts: {m.meta.context.dropped} ·
                          Insufficient: {m.meta.context.insufficient ? "Yes" : "No"}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="message assistant">
                <span>...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-form" onSubmit={handleFormSubmit}>
            <input
              className="chat-input"
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              placeholder="Ask me anything about Jack..."
              disabled={isLoading}
            />
            <button
              type="submit"
              className="chat-submit-button"
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
            >
              <AiOutlineSend size={20} />
            </button>
          </form>
        </div>

        <button
          className="chat-panel-button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Open chat assistant"
        >
          <FcAssistant />
        </button>
      </div>
    </>
  );
}
