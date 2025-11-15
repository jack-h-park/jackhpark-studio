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
  useCallback,
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
  type ChatEngine,
  MODEL_PROVIDER_LABELS,
  type ModelProvider,
  normalizeChatEngine,
  normalizeModelProvider,
} from "@/lib/shared/model-provider";

const DEFAULT_MODEL_PROVIDER: ModelProvider = normalizeModelProvider(
  process.env.NEXT_PUBLIC_LLM_PROVIDER ?? null,
  "openai",
);
const DEFAULT_ENGINE: ChatEngine = normalizeChatEngine(
  process.env.NEXT_PUBLIC_CHAT_ENGINE ?? null,
  "lc",
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

  .runtime-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .runtime-readonly {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .runtime-readonly__hint {
    margin-top: 4px;
    font-size: 0.75rem;
    color: #6b7280;
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
  .meta-debug-item {
    font-size: 0.8rem;
    line-height: 1.4;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .meta-debug-label {
    color: #475569;
  }
  .meta-debug-value {
    font-weight: 600;
    color: #0f172a;
  }

  .guardrail-summary {
    margin-top: 4px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid rgba(37, 99, 235, 0.2);
    background: rgba(241, 245, 255, 0.7);
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.7rem;
  }

  .guardrail-summary-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: space-between;
  }

  .guardrail-summary-entry {
    flex: 1 1 120px;
    min-width: 110px;
  }

  .guardrail-summary-label {
    font-size: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #5b6476;
    margin-bottom: 1px;
  }

  .guardrail-summary-value {
    font-size: 0.72rem;
    font-weight: 600;
    color: #0f172a;
    line-height: 1.2;
  }

  .guardrail-summary-value.warning {
    color: #b45309;
  }

  .guardrail-summary-row.summary-chip {
    justify-content: flex-start;
    margin-top: 2px;
  }

  .message-citations {
    margin-top: 4px;
    padding-left: 18px;
    font-size: 0.6rem;
    line-height: 1.2;
    color: #4b5563;
  }

  .message-citations li {
    margin-bottom: 2px;
    word-break: break-word;
  }

  .message-citations a {
    color: #1d4ed8;
  }
  .citation-count {
    margin-left: 4px;
    color: #6b7280;
    font-size: 0.65rem;
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
    const key = urlKey && urlKey.length > 0
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
  llmModel?: string | null;
  embeddingModel?: string | null;
};

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

  const [runtimeConfig, setRuntimeConfig] = useState<ChatRuntimeConfig>({
    engine: DEFAULT_ENGINE,
    llmProvider: DEFAULT_MODEL_PROVIDER,
    embeddingProvider: DEFAULT_MODEL_PROVIDER,
    llmModel: null,
    embeddingModel: null,
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showCitations, setShowCitations] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const loadConfig = async () => {
      try {
        const response = await fetch("/api/chat-config", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to load chat config (${response.status})`);
        }
        const payload = (await response.json()) as {
          models?: {
            engine?: string | null;
            llmProvider?: string | null;
            embeddingProvider?: string | null;
            llmModel?: string | null;
            embeddingModel?: string | null;
          } | null;
        };
        const models = payload?.models;
        if (!models) {
          return;
        }
        const resolvedLlmProvider = normalizeModelProvider(
          models.llmProvider,
          DEFAULT_MODEL_PROVIDER,
        );
        const resolvedEmbeddingProvider = normalizeModelProvider(
          models.embeddingProvider ?? models.llmProvider,
          resolvedLlmProvider,
        );
        setRuntimeConfig({
          engine: normalizeChatEngine(models.engine, DEFAULT_ENGINE),
          llmProvider: resolvedLlmProvider,
          embeddingProvider: resolvedEmbeddingProvider,
          llmModel: models.llmModel ?? null,
          embeddingModel: models.embeddingModel ?? null,
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn("Failed to load chat model settings; using defaults.", err);
        }
      }
    };
    void loadConfig();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = localStorage.getItem("chat_guardrail_debug");
    setShowDiagnostics(stored === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setShowCitations(localStorage.getItem("chat_show_citations") === "1");
  }, []);

  const toggleDiagnostics = () => {
    setShowDiagnostics((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("chat_guardrail_debug", next ? "1" : "0");
      }
      return next;
    });
  };

  const toggleCitations = () => {
    setShowCitations((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("chat_show_citations", next ? "1" : "0");
      }
      return next;
    });
  };

  const toggleOptions = () => {
    setShowOptions((prev) => !prev);
  };

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

      return [
        ...prev,
        userMessage,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          runtime: runtimeConfig,
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
        const endpoint = `/api/chat?engine=${activeRuntime.engine}`;
        const sanitizedMessagesPayload = [...messages, userMessage].map(
          (message) => ({
            role: message.role,
            content: message.content,
          }),
        );

        if (activeRuntime.engine === "lc") {
          // LangChain streaming
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: value,
              messages: sanitizedMessagesPayload,
              provider: activeRuntime.llmProvider,
              embeddingProvider: activeRuntime.embeddingProvider,
              model: activeRuntime.llmModel ?? undefined,
              embeddingModel: activeRuntime.embeddingModel ?? undefined,
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
              provider: activeRuntime.llmProvider,
              embeddingProvider: activeRuntime.embeddingProvider,
              model: activeRuntime.llmModel ?? undefined,
              embeddingModel: activeRuntime.embeddingModel ?? undefined,
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
                <div className="chat-control-block">
                  <span className="chat-control-label">Engine & model</span>
                  <div className="runtime-readonly">
                    <span className="meta-chip">
                      Engine: {runtimeConfig.engine === "lc" ? "LangChain" : "Native"}
                    </span>
                    <span className="meta-chip">
                      LLM:{" "}
                      {MODEL_PROVIDER_LABELS[runtimeConfig.llmProvider]}
                      {runtimeConfig.llmModel ? ` · ${runtimeConfig.llmModel}` : ""}
                    </span>
                    <span className="meta-chip">
                      Embedding:{" "}
                      {MODEL_PROVIDER_LABELS[runtimeConfig.embeddingProvider]}
                      {runtimeConfig.embeddingModel
                        ? ` · ${runtimeConfig.embeddingModel}`
                        : ""}
                    </span>
                  </div>
                  <p className="runtime-readonly__hint">
                    Managed in Admin → Chat Configuration.
                  </p>
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
                <div className="chat-control-block">
                  <span className="chat-control-label">Citations</span>
                  <div className="guardrail-toggle-row">
                    <span className="guardrail-description">
                      Show every retrieved source (tiny text)
                    </span>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={showCitations}
                        onChange={toggleCitations}
                        aria-label="Toggle citation visibility"
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </header>

          <div className="chat-messages">
            {messages.map((m) => {
              const mergedCitations =
                m.citations && m.citations.length > 0
                  ? mergeCitations(m.citations)
                  : null;
              const contextStats = m.meta?.context
              const totalExcerptsRaw =
                contextStats?.retrieved ??
                (typeof contextStats?.included === "number" &&
                typeof contextStats?.dropped === "number"
                  ? contextStats.included + contextStats.dropped
                  : null)
              const totalExcerpts =
                totalExcerptsRaw !== null && totalExcerptsRaw !== undefined
                  ? Math.max(totalExcerptsRaw, contextStats?.included ?? 0)
                  : null
              const contextUsageLabel =
                contextStats && totalExcerpts !== null && totalExcerpts > 0
                  ? `${contextStats.included} used out of ${totalExcerpts} excerpts`
                  : contextStats
                    ? `${contextStats.included} excerpts`
                    : null
              const contextTokensLabel =
                contextStats && `(${contextStats.totalTokens} tokens)`
              const similarityThreshold =
                contextStats &&
                typeof contextStats.similarityThreshold === "number"
                  ? contextStats.similarityThreshold
                  : null
              const highestSimilarity =
                contextStats &&
                typeof contextStats.highestSimilarity === "number"
                  ? contextStats.highestSimilarity
                  : null
              const historyStats = m.meta?.history
            const historyLabel = historyStats
              ? `${historyStats.tokens} / ${historyStats.budget} tokens${
                  historyStats.trimmedTurns > 0
                    ? ` (${historyStats.trimmedTurns} trimmed)`
                    : ""
                }`
              : typeof m.meta?.historyTokens === "number"
                ? `${m.meta.historyTokens} tokens`
                : null
              const runtimeEngineLabel =
                m.runtime?.engine === "lc"
                  ? "LangChain"
                  : m.runtime?.engine === "native"
                    ? "Native"
                    : null
              const runtimeLlmLabel = m.runtime
                ? `${MODEL_PROVIDER_LABELS[m.runtime.llmProvider]}${
                    m.runtime.llmModel ? ` · ${m.runtime.llmModel}` : ""
                  }`
                : null
              const runtimeEmbeddingLabel = m.runtime
                ? `${MODEL_PROVIDER_LABELS[m.runtime.embeddingProvider]}${
                    m.runtime.embeddingModel ? ` · ${m.runtime.embeddingModel}` : ""
                  }`
                : null
              const hasRuntime = Boolean(
                runtimeEngineLabel || runtimeLlmLabel || runtimeEmbeddingLabel,
              )
              const hasGuardrailMeta = Boolean(contextStats)
              const hasAnyMeta = hasRuntime || hasGuardrailMeta

              return (
                <div key={m.id} className="message-group">
                  <div className={`message ${m.role}`}>
                    {typeof m.content === "string"
                      ? renderMessageContent(m.content, m.id)
                      : m.content}
                  </div>
                {m.role === "assistant" && hasAnyMeta && (
                  <div className="message-meta">
                    {hasRuntime && (
                      <div className="runtime-summary">
                        {runtimeEngineLabel && (
                          <span className="meta-chip">Engine: {runtimeEngineLabel}</span>
                        )}
                        {runtimeLlmLabel && (
                          <span className="meta-chip">LLM: {runtimeLlmLabel}</span>
                        )}
                        {runtimeEmbeddingLabel && (
                          <span className="meta-chip">
                            Embedding: {runtimeEmbeddingLabel}
                          </span>
                        )}
                      </div>
                    )}
                    {contextStats && (
                      <div className="guardrail-summary">
                        <div className="guardrail-summary-row">
                          <div className="guardrail-summary-entry">
                            <div className="guardrail-summary-label">Route</div>
                            <div className="guardrail-summary-value">
                              {m.meta!.reason ?? m.meta!.intent}
                            </div>
                          </div>
                          <div className="guardrail-summary-entry">
                            <div className="guardrail-summary-label">Context</div>
                            <div
                              className={`guardrail-summary-value ${contextStats.insufficient ? "warning" : ""}`}
                            >
                              {contextUsageLabel}
                              {contextTokensLabel ? ` ${contextTokensLabel}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="guardrail-summary-row">
                          {historyLabel && (
                            <div className="guardrail-summary-entry">
                              <div className="guardrail-summary-label">History</div>
                              <div className="guardrail-summary-value">
                                {historyLabel}
                              </div>
                            </div>
                          )}
                          {similarityThreshold !== null && (
                            <div className="guardrail-summary-entry">
                              <div className="guardrail-summary-label">Similarity</div>
                              <div className="guardrail-summary-value">
                                {highestSimilarity !== null
                                  ? highestSimilarity.toFixed(3)
                                  : "—"}{" "}
                                / min {similarityThreshold.toFixed(2)}
                                {contextStats.insufficient ? " (Insufficient)" : ""}
                              </div>
                            </div>
                          )}
                        </div>
                        {m.meta?.summaryApplied && (
                          <div className="guardrail-summary-row summary-chip">
                            <span className="meta-chip">Summary applied</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                  {m.role === "assistant" &&
                    showCitations &&
                    mergedCitations &&
                    mergedCitations.length > 0 && (
                      <ol className="message-citations">
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
                          excerptCount > 1
                            ? `${excerptCount} excerpts`
                            : null;
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
                              <span className="citation-count">
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
