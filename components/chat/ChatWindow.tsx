"use client";

import { AiOutlineArrowsAlt } from "@react-icons/all-files/ai/AiOutlineArrowsAlt";
import { AiOutlineClose } from "@react-icons/all-files/ai/AiOutlineClose";
import { AiOutlineCompress } from "@react-icons/all-files/ai/AiOutlineCompress";
import { AiOutlineSend } from "@react-icons/all-files/ai/AiOutlineSend";
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

import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { Switch } from "@/components/ui/switch";
import { resolveEmbeddingSpace } from "@/lib/core/embedding-spaces";
import { resolveLlmModel } from "@/lib/core/llm-registry";
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
import {
  DEFAULT_HYDE_ENABLED,
  DEFAULT_RANKER_MODE,
  DEFAULT_REVERSE_RAG_ENABLED,
  DEFAULT_REVERSE_RAG_MODE,
  type RankerMode,
  type ReverseRagMode,
} from "@/lib/shared/rag-config";

const DEFAULT_LLM_SELECTION = resolveLlmModel({
  modelId: process.env.NEXT_PUBLIC_LLM_MODEL ?? process.env.LLM_MODEL ?? null,
  provider:
    process.env.NEXT_PUBLIC_LLM_PROVIDER ?? process.env.LLM_PROVIDER ?? null,
  model: process.env.NEXT_PUBLIC_LLM_MODEL ?? null,
});
const DEFAULT_EMBEDDING_SELECTION = resolveEmbeddingSpace({
  embeddingModelId:
    process.env.NEXT_PUBLIC_EMBEDDING_MODEL ??
    process.env.EMBEDDING_MODEL ??
    null,
  embeddingSpaceId:
    (process.env.NEXT_PUBLIC_EMBEDDING_SPACE_ID as string | undefined) ??
    process.env.EMBEDDING_SPACE_ID ??
    null,
  provider:
    process.env.NEXT_PUBLIC_EMBEDDING_PROVIDER ??
    process.env.NEXT_PUBLIC_LLM_PROVIDER ??
    process.env.EMBEDDING_PROVIDER ??
    process.env.LLM_PROVIDER ??
    null,
});
const DEFAULT_ENGINE: ChatEngine = normalizeChatEngine(
  process.env.NEXT_PUBLIC_CHAT_ENGINE ?? null,
  "lc",
);

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
const styles = css`
  .chat-panel {
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
    padding: 5px 10px;
    font-size: 0.7rem;
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
    gap: 10px;
    background: #f4f6fb;
    border: 1px solid #e3e7f2;
    border-radius: 10px;
    padding: 11px;
    margin-top: 10px;
  }

  .chat-control-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }



  .guardrail-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: #fff;
    border: 1px solid #d3d8ee;
    border-radius: 8px;
    padding: 8px 10px;
  }

  .guardrail-toggle-row--auto {
    background: #f9fafb;
  }

  .guardrail-description {
    flex: 1;
  }

  .guardrail-toggle-row__switch {
    margin-left: auto;
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

  .message.assistant.is-loading {
    position: relative;
    overflow: hidden;
  }

  .assistant-loading-indicator {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }

  .assistant-loading-indicator span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(10, 69, 132, 0.6);
    animation: assistant-pulse 0.8s infinite ease-in-out;
  }

  .assistant-loading-indicator span:nth-child(2) {
    animation-delay: 0.1s;
  }

  .assistant-loading-indicator span:nth-child(3) {
    animation-delay: 0.2s;
  }

  @keyframes assistant-pulse {
    0%,
    100% {
      transform: translateY(0);
      opacity: 0.3;
    }
    50% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  .message-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
  }

  .meta-card {
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 8px 10px;
    background: #fff;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
  }

  .meta-card--runtime {
    border-color: #cbd5f5;
    background: #edf2ff;
  }

  .meta-card--guardrail {
    border-color: #cbd5f5;
    background: #f8fafc;
  }

  .meta-card--enhancements {
    border-color: #fcd34d;
    background: #fff7ed;
  }

  .meta-card__heading {
    font-size: 0.6rem;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #475569;
  }

  .meta-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 6px;
    margin-top: 4px;
  }

  .meta-card-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .meta-card-block--summary {
    margin-top: 10px;
  }

  .meta-card-block__label {
    font-size: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #6b7280;
  }

  .meta-card-block__value {
    font-weight: 600;
    font-size: 0.55rem;
    color: #0f172a;
  }

  .meta-card-block__secondary {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #475569;
    line-height: 1.3;
    margin-top: 4px;
  }

  .telemetry-collapse-row {
    display: flex;
    justify-content: flex-end;
  }

  .telemetry-collapse-btn {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    background: none;
    border: none;
    color: #2563eb;
    cursor: pointer;
    padding: 0;
  }

  .telemetry-collapse-row--top,
  .telemetry-collapse-row--config {
    margin-top: 6px;
  }

  .meta-card-block__value.warning {
    color: #b45309;
  }

  .meta-card-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }

  .enhancement-chip {
    position: relative;
    cursor: help;
  }

  .enhancement-chip[data-tooltip]:not([data-tooltip=""])::after {
    content: attr(data-tooltip);
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 6px;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(15, 23, 42, 0.9);
    color: #fff;
    font-size: 0.65rem;
    white-space: pre-line;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.2s ease,
      visibility 0.2s ease;
    z-index: 3;
  }

  .enhancement-chip[data-tooltip]:not([data-tooltip=""]):hover::after {
    visibility: visible;
    opacity: 1;
  }

  .meta-chip.warning {
    background: rgba(255, 140, 0, 0.15);
    color: #b45309;
  }

  .chat-runtime-summary {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.82rem;
  }

  .chat-runtime-summary__row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .chat-runtime-summary__label {
    font-size: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #6b7280;
    min-width: 70px;
  }

  .chat-runtime-summary__value {
    font-weight: 600;
    color: #0f172a;
    font-size: 0.8rem;
  }

  .chat-runtime-flags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }

  .chat-runtime-flag {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(37, 99, 235, 0.1);
    color: #1d4ed8;
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
    .chat-panel {
      width: calc(100vw - 32px);
      height: 70vh;
    }
    .chat-panel.is-large {
      width: calc(100vw - 32px);
      height: 72vh;
    }
  }
`;
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

  const [runtimeConfig, setRuntimeConfig] = useState<ChatRuntimeConfig>({
    engine: DEFAULT_ENGINE,
    llmProvider: DEFAULT_LLM_SELECTION.provider,
    embeddingProvider: DEFAULT_EMBEDDING_SELECTION.provider,
    llmModelId: DEFAULT_LLM_SELECTION.id,
    embeddingModelId: DEFAULT_EMBEDDING_SELECTION.embeddingModelId,
    embeddingSpaceId: DEFAULT_EMBEDDING_SELECTION.embeddingSpaceId,
    llmModel: DEFAULT_LLM_SELECTION.model,
    embeddingModel: DEFAULT_EMBEDDING_SELECTION.model,
    reverseRagEnabled: DEFAULT_REVERSE_RAG_ENABLED,
    reverseRagMode: DEFAULT_REVERSE_RAG_MODE,
    hydeEnabled: DEFAULT_HYDE_ENABLED,
    rankerMode: DEFAULT_RANKER_MODE,
  });
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
  const [loadingAssistantId, setLoadingAssistantId] = useState<string | null>(null);
  const loadingAssistantRef = useRef<string | null>(null);

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
            llmModelId?: string | null;
            embeddingModelId?: string | null;
            embeddingSpaceId?: string | null;
            reverseRagEnabled?: boolean | null;
            reverseRagMode?: ReverseRagMode | null;
            hydeEnabled?: boolean | null;
            rankerMode?: RankerMode | null;
          } | null;
        };
        const models = payload?.models;
        if (!models) {
          return;
        }
        const resolvedLlmProvider = normalizeModelProvider(
          models.llmProvider ?? DEFAULT_LLM_SELECTION.provider,
          DEFAULT_LLM_SELECTION.provider,
        );
        const resolvedEmbeddingProvider = normalizeModelProvider(
          models.embeddingProvider ??
            models.llmProvider ??
            DEFAULT_EMBEDDING_SELECTION.provider,
          DEFAULT_EMBEDDING_SELECTION.provider,
        );
        setRuntimeConfig({
          engine: normalizeChatEngine(models.engine, DEFAULT_ENGINE),
          llmProvider: resolvedLlmProvider,
          embeddingProvider: resolvedEmbeddingProvider,
          llmModelId:
            models.llmModelId ?? models.llmModel ?? DEFAULT_LLM_SELECTION.id,
          embeddingModelId:
            models.embeddingModelId ??
            models.embeddingModel ??
            DEFAULT_EMBEDDING_SELECTION.embeddingModelId,
          embeddingSpaceId:
            models.embeddingSpaceId ??
            DEFAULT_EMBEDDING_SELECTION.embeddingSpaceId,
          llmModel: models.llmModel ?? DEFAULT_LLM_SELECTION.model,
          embeddingModel:
            models.embeddingModel ?? DEFAULT_EMBEDDING_SELECTION.model,
          reverseRagEnabled:
            models.reverseRagEnabled ?? DEFAULT_REVERSE_RAG_ENABLED,
          reverseRagMode: models.reverseRagMode ?? DEFAULT_REVERSE_RAG_MODE,
          hydeEnabled: models.hydeEnabled ?? DEFAULT_HYDE_ENABLED,
          rankerMode: models.rankerMode ?? DEFAULT_RANKER_MODE,
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn(
            "Failed to load chat model settings; using defaults.",
            err,
          );
        }
      }
    };
    void loadConfig();
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

            setLoadingAssistantId(assistantMessageId)
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
        const llmModelPayload =
          activeRuntime.llmModelId ?? activeRuntime.llmModel ?? undefined;
        const embeddingModelPayload =
          activeRuntime.embeddingModelId ??
          activeRuntime.embeddingModel ??
          undefined;
        const embeddingSpacePayload =
          activeRuntime.embeddingSpaceId ?? undefined;
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
              model: llmModelPayload,
              embeddingModel: embeddingModelPayload,
              embeddingSpaceId: embeddingSpacePayload,
              reverseRagEnabled: activeRuntime.reverseRagEnabled,
              reverseRagMode: activeRuntime.reverseRagMode,
              hydeEnabled: activeRuntime.hydeEnabled,
              rankerMode: activeRuntime.rankerMode,
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
              provider: activeRuntime.llmProvider,
              embeddingProvider: activeRuntime.embeddingProvider,
              model: llmModelPayload,
              embeddingModel: embeddingModelPayload,
              embeddingSpaceId: embeddingSpacePayload,
              reverseRagEnabled: activeRuntime.reverseRagEnabled,
              reverseRagMode: activeRuntime.reverseRagMode,
              hydeEnabled: activeRuntime.hydeEnabled,
              rankerMode: activeRuntime.rankerMode,
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
              engine: activeRuntime.engine,
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
      <style jsx>{styles}</style>
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
                 {showOptions ? "Hide Settings" : "Show Settings"}
                </button>
                {headerAction}
                {showExpandButton && (
                  <button
                    type="button"
                    className="chat-expand-button"
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
                    className="chat-close-button"
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
              <div className="chat-config-bar">
                <div className="chat-control-block">
                  <span className="ai-field__label">Engine &amp; model</span>
                  <div className="chat-runtime-summary">
                    <div className="chat-runtime-summary__row">
                      <span className="chat-runtime-summary__label">
                        Engine
                      </span>
                      <span className="chat-runtime-summary__value">
                        {runtimeConfig.engine === "lc" ? "LangChain" : "Native"}
                      </span>
                    </div>
                    <div className="chat-runtime-summary__row">
                      <span className="chat-runtime-summary__label">LLM</span>
                      <span className="chat-runtime-summary__value">
                        {runtimeConfig.llmProvider === "openai"
                          ? "OpenAI"
                          : MODEL_PROVIDER_LABELS[
                              runtimeConfig.llmProvider
                            ]}{" "}
                        {runtimeConfig.llmModel ?? "custom model"}
                      </span>
                    </div>
                    <div className="chat-runtime-summary__row">
                      <span className="chat-runtime-summary__label">
                        Embedding
                      </span>
                      <span className="chat-runtime-summary__value">
                        {runtimeConfig.embeddingModelId ??
                          runtimeConfig.embeddingModel ??
                          "custom embedding"}
                      </span>
                    </div>
                  </div>
                  <div className="chat-runtime-flags">
                    <span
                      className="chat-runtime-flag"
                      title="Reverse RAG enables query rewriting before retrieval"
                    >
                      Reverse RAG:{" "}
                      {runtimeConfig.reverseRagEnabled
                        ? `on (${runtimeConfig.reverseRagMode})`
                        : "off"}
                    </span>
                    <span
                      className="chat-runtime-flag"
                      title="Ranker mode applied after the initial retrieval"
                    >
                      Ranker: {runtimeConfig.rankerMode.toUpperCase()}
                    </span>
                    <span
                      className="chat-runtime-flag"
                      title="HyDE generates a hypothetical document before embedding"
                    >
                      HyDE: {runtimeConfig.hydeEnabled ? "on" : "off"}
                    </span>
                  </div>
                </div>
                <div className="chat-control-block">
                  <div className="guardrail-toggle-row">
                    <div className="guardrail-description ai-choice">
                      <span className="ai-choice__label">Telemetry badges</span>
                      <p className="ai-choice__description">
                        Show engine, guardrail, and enhancement insights
                      </p>
                    </div>
                    <Switch
                      className="guardrail-toggle-row__switch"
                      checked={showTelemetry}
                      onCheckedChange={handleTelemetrySwitchChange}
                      aria-label="Toggle telemetry visibility"
                    />
                  </div>
                  <div className="guardrail-toggle-row guardrail-toggle-row--auto">
                    <div className="guardrail-description ai-choice">
                      <span className="ai-choice__label">
                        Auto expand telemetry on toggle
                      </span>
                    </div>
                    <Switch
                      className="guardrail-toggle-row__switch"
                      checked={telemetryAutoExpand}
                      onCheckedChange={handleAutoExpandChange}
                      aria-label="Toggle auto expand telemetry"
                    />
                  </div>
                </div>
                <div className="chat-control-block">
                  <div className="guardrail-toggle-row">
                    <div className="guardrail-description ai-choice">
                      <span className="ai-choice__label">Citations</span>
                      <p className="ai-choice__description">
                        Show every retrieved source (tiny text)
                      </p>
                    </div>
                    <Switch
                      className="guardrail-toggle-row__switch"
                      checked={showCitations}
                      onCheckedChange={handleCitationsSwitchChange}
                      aria-label="Toggle citation visibility"
                    />
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
                contextStats &&
                typeof contextStats.highestSimilarity === "number"
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
                m.runtime?.llmModelId ?? m.runtime?.llmModel ?? null;
              const runtimeLlmDisplay =
                runtimeLlmProviderLabel && runtimeLlmModelLabel
                  ? `${runtimeLlmProviderLabel} / ${runtimeLlmModelLabel}`
                  : (runtimeLlmModelLabel ?? runtimeLlmProviderLabel);
              const runtimeEmbeddingModelLabel =
                m.runtime?.embeddingModelId ??
                m.runtime?.embeddingModel ??
                null;
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
                <div key={m.id} className="message-group">
                <div className={`message ${m.role} ${
                  isStreamingAssistant ? "is-loading" : ""
                }`}>
                  {typeof m.content === "string"
                    ? renderMessageContent(m.content, m.id)
                    : m.content}
                  {isStreamingAssistant && (
                    <div className="assistant-loading-indicator">
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                </div>
                  {m.role === "assistant" && hasAnyMeta && (
                    <div className="message-meta">
                      {showTelemetry && (
                        <div className="telemetry-collapse-row">
                          <button
                            type="button"
                            className="telemetry-collapse-btn"
                            onClick={toggleTelemetryExpanded}
                          >
                            {telemetryExpanded
                              ? "Hide telemetry details"
                              : "Show telemetry details"}
                          </button>
                        </div>
                      )}
                      {showRuntimeCard && (
                        <div className="meta-card meta-card--runtime">
                          <div className="meta-card__heading">
                            Engine &amp; Model
                          </div>
                          <div className="meta-card-grid">
                            {runtimeEngineLabel && (
                              <div className="meta-card-block">
                                <div className="meta-card-block__label">
                                  ENGINE
                                </div>
                                <div className="meta-card-block__value">
                                  {runtimeEngineLabel}
                                </div>
                              </div>
                            )}
                            {runtimeLlmDisplay && (
                              <div className="meta-card-block">
                                <div className="meta-card-block__label">
                                  LLM
                                </div>
                                <div className="meta-card-block__value">
                                  {runtimeLlmDisplay}
                                </div>
                              </div>
                            )}
                            {runtimeEmbeddingModelLabel && (
                              <div className="meta-card-block">
                                <div className="meta-card-block__label">
                                  EMBEDDING
                                </div>
                                <div className="meta-card-block__value">
                                  {runtimeEmbeddingModelLabel}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {showGuardrailCards && (
                        <div className="meta-card meta-card--guardrail">
                          <div className="meta-card__heading">Guardrails</div>
                          <div className="meta-card-grid">
                            <div className="meta-card-block">
                              <div className="meta-card-block__label">
                                ROUTE
                              </div>
                              <div className="meta-card-block__value">
                                {m.meta!.reason ?? m.meta!.intent}
                              </div>
                            </div>
                            <div className="meta-card-block">
                              <div className="meta-card-block__label">
                                CONTEXT
                              </div>
                              <div
                                className={`meta-card-block__value ${contextStats.insufficient ? "warning" : ""}`}
                              >
                                {contextUsageLabel}
                                {contextTokensLabel
                                  ? ` ${contextTokensLabel}`
                                  : ""}
                              </div>
                            </div>
                            {historyLabel && (
                              <div className="meta-card-block">
                                <div className="meta-card-block__label">
                                  HISTORY
                                </div>
                                <div className="meta-card-block__value">
                                  {historyLabel}
                                </div>
                              </div>
                            )}
                            {similarityThreshold !== null && (
                              <div className="meta-card-block">
                                <div className="meta-card-block__label">
                                  SIMILARITY
                                </div>
                                <div
                                  className={`meta-card-block__value ${contextStats.insufficient ? "warning" : ""}`}
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
                            <div className="meta-card-block meta-card-block--summary">
                              <div className="meta-card-block__label">
                                SUMMARY
                              </div>
                              <div className="meta-card-block__value">
                                {summaryInfo
                                  ? `History summarized (${summaryInfo.originalTokens} → ${summaryInfo.summaryTokens} tokens)`
                                  : historySummaryLabel}
                              </div>
                              {summaryInfo ? (
                                <div className="meta-card-block__secondary">
                                  {summaryInfo.trimmedTurns} of{" "}
                                  {summaryInfo.maxTurns} turns summarized
                                </div>
                              ) : null}
                            </div>
                          )}
                          {m.meta?.summaryApplied && (
                            <div className="meta-card-footer">
                              <span className="meta-chip">Summary applied</span>
                            </div>
                          )}
                        </div>
                      )}
                      {showEnhancementCard && (
                        <div className="meta-card meta-card--enhancements">
                          <div className="meta-card__heading">Enhancements</div>
                          <div className="meta-card-grid">
                            <div className="meta-card-block">
                              <div className="meta-card-block__label">
                                REVERSE RAG
                              </div>
                              <div
                                className="meta-card-block__value enhancement-chip"
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
                                <div className="meta-card-block__secondary">
                                  {`original: ${truncateText(enhancements.reverseRag.original, 40)}`}
                                  <br />
                                  {`rewritten: ${truncateText(enhancements.reverseRag.rewritten, 40)}`}
                                </div>
                              )}
                            </div>
                            <div className="meta-card-block">
                              <div className="meta-card-block__label">HyDE</div>
                              <div
                                className="meta-card-block__value enhancement-chip"
                                data-tooltip={
                                  enhancements?.hyde?.generated ?? ""
                                }
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
                            <div className="meta-card-block">
                              <div className="meta-card-block__label">
                                RANKER
                              </div>
                              <div className="meta-card-block__value">
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
    </>
  );
}
