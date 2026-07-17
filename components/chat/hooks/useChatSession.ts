"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CitationDocScore,
  CitationMeta,
  CitationPayload,
} from "@/lib/types/citation";
import { isClientLogLevelEnabled } from "@/lib/logging/client";
import { PRESET_LABELS_SHORT } from "@/lib/shared/chat-labels";
import {
  deserializeGuardrailMeta,
  type GuardrailMeta,
} from "@/lib/shared/guardrail-meta";
import { type ModelProvider } from "@/lib/shared/model-provider";
import { type ModelResolutionReason } from "@/lib/shared/model-resolution";
import { type RankerMode, type ReverseRagMode } from "@/lib/shared/rag-config";
import {
  type ChatEngineType,
  type EmbeddingSpaceWarning,
  type SessionChatConfig,
} from "@/types/chat-config";

const CITATIONS_SEPARATOR = `\n\n--- begin citations ---\n`;
const STREAM_TRACE_LOGGING_ENABLED = isClientLogLevelEnabled(
  "externalLLM",
  "trace",
);

const parseCitationPayload = (
  raw?: string | null,
): CitationPayload | undefined => {
  if (!raw) return undefined;
  try {
    const candidate = JSON.parse(raw);
    if (
      candidate &&
      typeof candidate === "object" &&
      Array.isArray((candidate as CitationPayload).citations)
    ) {
      return candidate as CitationPayload;
    }
  } catch {
    // ignore parse errors
  }
  return undefined;
};

export type ChatRuntimeFallbackFrom = {
  type: "local";
  provider: ModelProvider;
  modelId: string;
};

export type ChatRuntimeConfig = {
  engine: string;
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
  isLocal: boolean;
  llmEngine: ChatEngineType;
  requireLocal: boolean;
  localBackendAvailable: boolean;
  fallbackFrom?: ChatRuntimeFallbackFrom | null;
  safeMode?: boolean;
  embeddingSpaceWarnings?: EmbeddingSpaceWarning[];
};

export type ChatMessageMetrics = {
  totalMs?: number;
  ttftMs?: number;
  aborted?: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  // Wall-clock creation time (ms epoch). Optional so pre-existing persisted
  // sessions without it still render; new messages always set it.
  createdAt?: number;
  meta?: GuardrailMeta | null;
  citations?: CitationDocScore[];
  citationMeta?: CitationMeta | null;
  runtime?: ChatRuntimeConfig | null;
  metrics?: ChatMessageMetrics;
  isComplete?: boolean;
  // Set when the assistant turn failed and the content is an error notice
  // rather than a model answer. Drives the "Try again" affordance.
  isError?: boolean;
  // Langfuse traceId for this response, surfaced via the X-Trace-Id header.
  // Used to attach user feedback (👍/👎) to the originating trace.
  traceId?: string | null;
};

type ChatResponse = {
  answer: string;
  citations?: CitationPayload;
};

class ChatRequestError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "ChatRequestError";
    this.status = status;
    this.code = code;
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

const parseErrorPayload = (
  raw?: string | null,
): { message: string; code?: string } | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const candidate = parsed as {
        error?: unknown;
        message?: unknown;
        code?: unknown;
      };

      // Handle nested error object: { error: { code, message } }
      if (
        candidate.error &&
        typeof candidate.error === "object" &&
        !Array.isArray(candidate.error)
      ) {
        const nestedError = candidate.error as {
          message?: unknown;
          code?: unknown;
        };
        if (typeof nestedError.message === "string") {
          return {
            message: nestedError.message,
            code:
              typeof nestedError.code === "string"
                ? nestedError.code
                : undefined,
          };
        }
      }

      if (typeof candidate.error === "string")
        return { message: candidate.error };
      if (typeof candidate.message === "string")
        return { message: candidate.message };
    }
  } catch {
    // Swallow JSON parse errors and fall back to the raw text.
  }
  return { message: trimmed };
};

const buildResponseError = async (response: Response) => {
  const fallback = `Request failed with status ${response.status}`;
  try {
    const raw = await response.text();
    const parsed = parseErrorPayload(raw);
    return new ChatRequestError(
      parsed?.message ?? fallback,
      response.status,
      parsed?.code,
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
    if (error.status === 429 || error.code === "RATE_LIMITED") {
      return "The assistant is receiving too many requests right now. Please wait a moment and try again.";
    }
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

export type UseChatSessionOptions = {
  source?: string;
  config?: SessionChatConfig;
  sessionKey?: string;
  initialMessages?: ChatMessage[];
};

// Preset recall escalation: maps current preset to the next higher-recall preset.
// highRecall has no escalation — the retry button is hidden when already at max recall.
const PRESET_RECALL_ESCALATION: Partial<Record<string, string>> = {
  fast: "default",
  default: "highRecall",
  precision: "highRecall",
};

const PRESET_LABELS: Record<string, string> = PRESET_LABELS_SHORT;

export type ChatRetryPreset = {
  /** Display label for the target preset, e.g. "High Recall". */
  label: string;
  /** The preset ID that will be used for the retry request. */
  presetId: string;
};

export type UseChatSessionResult = {
  messages: ChatMessage[];
  isLoading: boolean;
  runtimeConfig: ChatRuntimeConfig | null;
  loadingAssistantId: string | null;
  sendMessage: (
    value: string,
    options?: { skipUserInsert?: boolean },
  ) => Promise<void>;
  /** The preset to escalate to on retry, or null if already at max recall. */
  retryPreset: ChatRetryPreset | null;
  retryWithPreset: (targetPresetId: string) => Promise<void>;
  /** Re-run the last user question with the current config, replacing the last answer. */
  regenerateLast: () => Promise<void>;
  /**
   * Replace a user message's content and re-run from that turn, dropping every
   * message after it (the standard "edit & resubmit" branch).
   */
  editMessageAt: (messageId: string, newContent: string) => Promise<void>;
  /** Abort any in-flight request and clear the conversation. */
  resetSession: () => void;
  abortActiveRequest: () => void;
};

type StreamAssistantArgs = {
  assistantMessageId: string;
  timestamp: number;
  controller: AbortController;
  requestBody: {
    question: string;
    messages: { role: ChatMessage["role"]; content: string }[];
    config?: SessionChatConfig;
  };
};

export function useChatSession(
  options?: UseChatSessionOptions,
): UseChatSessionResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<ChatRuntimeConfig | null>(
    null,
  );
  const [loadingAssistantId, setLoadingAssistantId] = useState<string | null>(
    null,
  );
  const loadingAssistantRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const sourceLabel = options?.source ?? "unknown";
  const config = options?.config;
  const sessionKey = options?.sessionKey ?? "__default__";
  const initialMessages = options?.initialMessages ?? [];
  const initialMessagesRef = useRef<ChatMessage[]>(initialMessages);

  useEffect(() => {
    initialMessagesRef.current = initialMessages;
  }, [initialMessages]);

  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages(initialMessagesRef.current);
    setIsLoading(false);
    setLoadingAssistantId(null);
  }, [sessionKey]);

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
            `[useChatSession:${sourceLabel}] chat runtime payload missing; telemetry disabled`,
          );
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn(
            `[useChatSession:${sourceLabel}] failed to load chat runtime; telemetry limited`,
            err,
          );
        }
      }
    };

    void loadRuntime();
    return () => controller.abort();
  }, [sourceLabel]);

  useEffect(() => {
    loadingAssistantRef.current = loadingAssistantId;
  }, [loadingAssistantId]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const abortActiveRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  // Keep the latest runtime config reachable from the streaming core without
  // adding it to that callback's deps (it loads asynchronously after mount).
  const runtimeConfigRef = useRef<ChatRuntimeConfig | null>(runtimeConfig);
  useEffect(() => {
    runtimeConfigRef.current = runtimeConfig;
  }, [runtimeConfig]);

  // Shared fetch + stream core for every send/regenerate/edit path. The caller
  // is responsible for having already inserted the user + placeholder-assistant
  // messages and set loading state; this drives the assistant message
  // identified by `assistantMessageId` to completion (or error).
  const streamAssistant = useCallback(async (args: StreamAssistantArgs) => {
    const { assistantMessageId, timestamp, controller, requestBody } = args;

    const updateAssistant = (
      content?: string,
      meta?: GuardrailMeta | null,
      citations?: ChatResponse["citations"],
      runtime?: ChatRuntimeConfig | null,
      isComplete?: boolean,
      metrics?: ChatMessageMetrics,
    ) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content:
                  typeof content === "string" ? content : message.content,
                ...(meta !== undefined ? { meta } : {}),
                ...(citations !== undefined
                  ? {
                      citations: citations.citations ?? [],
                      citationMeta: citations.citationMeta ?? null,
                    }
                  : {}),
                ...(runtime !== undefined ? { runtime } : {}),
                ...(isComplete !== undefined ? { isComplete } : {}),
                ...(metrics || isComplete
                  ? {
                      metrics: {
                        ...message.metrics,
                        ...metrics,
                        ...(isComplete
                          ? { totalMs: Date.now() - timestamp }
                          : {}),
                      },
                    }
                  : {}),
              }
            : message,
        ),
      );
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
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

      // Without the traceId the answer would silently lose its 👍/👎 control.
      const traceId = response.headers.get("x-trace-id");
      if (traceId) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId
              ? { ...message, traceId }
              : message,
          ),
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      let done = false;
      let ttftRecorded = false;
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
        if (STREAM_TRACE_LOGGING_ENABLED) {
          // eslint-disable-next-line unicorn/prefer-string-replace-all
          const preview = chunkText.replace(/\s+/g, " ").trim();
          console.debug(
            `[langchain_chat:client] chunk (${chunkText.length} chars): ${
              preview.length > 0 ? preview.slice(0, 40) : "<empty>"
            }`,
          );
        }
        if (!isMountedRef.current) return;

        const [answer] = fullContent.split(CITATIONS_SEPARATOR);
        updateAssistant(answer);

        if (!ttftRecorded && answer.trim().length > 0) {
          ttftRecorded = true;
          updateAssistant(undefined, undefined, undefined, undefined, undefined, {
            ttftMs: Date.now() - timestamp,
          });
        }
      }

      const [answer, citationsJson] = fullContent.split(CITATIONS_SEPARATOR);
      const finalContent = (answer ?? "").trim();
      const parsedPayload = parseCitationPayload(citationsJson);

      if (isMountedRef.current) {
        updateAssistant(
          finalContent,
          guardrailMeta,
          parsedPayload,
          runtimeConfigRef.current ?? null,
          true,
        );
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      if (controller.signal.aborted) {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: item.content.trim() + " [Stopped]",
                  isComplete: true,
                  metrics: {
                    ...item.metrics,
                    totalMs: Date.now() - timestamp,
                    aborted: true,
                  },
                }
              : item,
          ),
        );
        return;
      }
      console.error("[useChatSession] chat request failed", err);
      const message = getUserFacingErrorMessage(err);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: `Warning: ${message}`,
                isComplete: true,
                isError: true,
                metrics: { ...item.metrics, totalMs: Date.now() - timestamp },
              }
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
  }, []);

  const sendMessage = useCallback(
    async (value: string, options?: { skipUserInsert?: boolean }) => {
      const trimmed = value.trim();
      if (!trimmed || isLoading) {
        return;
      }

      const timestamp = Date.now();
      const userMessage: ChatMessage = {
        id: `user-${timestamp}`,
        role: "user",
        content: trimmed,
        createdAt: timestamp,
      };
      const assistantMessageId = `assistant-${timestamp}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        isComplete: false,
        createdAt: timestamp,
      };

      const historyForRequest = options?.skipUserInsert
        ? messages
        : [...messages, userMessage];

      setLoadingAssistantId(assistantMessageId);
      setMessages((previous) => {
        if (!isMountedRef.current) {
          return previous;
        }
        if (options?.skipUserInsert) {
          return [...previous, assistantMessage];
        }
        return [...previous, userMessage, assistantMessage];
      });
      setIsLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      await streamAssistant({
        assistantMessageId,
        timestamp,
        controller,
        requestBody: {
          question: trimmed,
          messages: historyForRequest.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          config,
        },
      });
    },
    [isLoading, messages, config, streamAssistant],
  );

  const currentPresetId = config?.presetId ?? "default";
  const nextPresetId = PRESET_RECALL_ESCALATION[currentPresetId] ?? null;
  const retryPreset: ChatRetryPreset | null = nextPresetId
    ? { label: PRESET_LABELS[nextPresetId] ?? nextPresetId, presetId: nextPresetId }
    : null;

  // Re-runs the last user question, replacing the last assistant answer.
  // targetPresetId escalates the recall preset; null keeps the current config
  // (generic regenerate / try-again).
  const rerunLastQuestion = useCallback(
    async (targetPresetId: string | null) => {
      if (isLoading || messages.length === 0) return;

      const lastMessage = messages.at(-1);
      if (!lastMessage) return;

      let userMessage: ChatMessage | null = null;
      let newHistory = messages;

      if (lastMessage.role === "user") {
        userMessage = lastMessage;
      } else if (lastMessage.role === "assistant") {
        const prev = messages.at(-2);
        if (prev?.role === "user") {
          userMessage = prev;
          newHistory = messages.slice(0, -1); // Drop the answer we're replacing.
        }
      }

      if (!userMessage) return;

      const timestamp = Date.now();
      const assistantMessageId = `assistant-${timestamp}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        isComplete: false,
        createdAt: timestamp,
      };

      setLoadingAssistantId(assistantMessageId);
      setMessages([...newHistory, assistantMessage]);
      setIsLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      await streamAssistant({
        assistantMessageId,
        timestamp,
        controller,
        requestBody: {
          question: userMessage.content,
          messages: newHistory.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          config:
            targetPresetId && config
              ? { ...config, presetId: targetPresetId }
              : config,
        },
      });
    },
    [isLoading, messages, config, streamAssistant],
  );

  const retryWithPreset = useCallback(
    (targetPresetId: string) => rerunLastQuestion(targetPresetId),
    [rerunLastQuestion],
  );

  const regenerateLast = useCallback(
    () => rerunLastQuestion(null),
    [rerunLastQuestion],
  );

  const editMessageAt = useCallback(
    async (messageId: string, newContent: string) => {
      if (isLoading) return;
      const trimmed = newContent.trim();
      if (!trimmed) return;

      const index = messages.findIndex((message) => message.id === messageId);
      if (index === -1 || messages[index].role !== "user") return;

      const timestamp = Date.now();
      // Everything before the edited turn is preserved; everything after it
      // (the old answer and any later turns) is dropped — the branch restarts
      // from the edited question.
      const precedingHistory = messages.slice(0, index);
      const editedUserMessage: ChatMessage = {
        id: `user-${timestamp}`,
        role: "user",
        content: trimmed,
        createdAt: timestamp,
      };
      const assistantMessageId = `assistant-${timestamp}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        isComplete: false,
        createdAt: timestamp,
      };
      const newHistory = [...precedingHistory, editedUserMessage];

      setLoadingAssistantId(assistantMessageId);
      setMessages([...newHistory, assistantMessage]);
      setIsLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      await streamAssistant({
        assistantMessageId,
        timestamp,
        controller,
        requestBody: {
          question: trimmed,
          messages: newHistory.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          config,
        },
      });
    },
    [isLoading, messages, config, streamAssistant],
  );

  const resetSession = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setIsLoading(false);
    setLoadingAssistantId(null);
  }, []);

  return {
    messages,
    isLoading,
    runtimeConfig,
    loadingAssistantId,
    sendMessage,
    retryPreset,
    retryWithPreset,
    regenerateLast,
    editMessageAt,
    resetSession,
    abortActiveRequest,
  };
}
