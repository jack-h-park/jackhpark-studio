"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CitationDocScore,
  CitationMeta,
  CitationPayload,
} from "@/lib/types/citation";
import { isClientLogLevelEnabled } from "@/lib/logging/client";
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
  meta?: GuardrailMeta | null;
  citations?: CitationDocScore[];
  citationMeta?: CitationMeta | null;
  runtime?: ChatRuntimeConfig | null;
  metrics?: ChatMessageMetrics;
  isComplete?: boolean;
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
};

export type UseChatSessionResult = {
  messages: ChatMessage[];
  isLoading: boolean;
  runtimeConfig: ChatRuntimeConfig | null;
  loadingAssistantId: string | null;
  sendMessage: (value: string) => Promise<void>;
  abortActiveRequest: () => void;
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

  const sendMessage = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || isLoading) {
        return;
      }

      const timestamp = Date.now();
      const userMessage: ChatMessage = {
        id: `user-${timestamp}`,
        role: "user",
        content: trimmed,
      };
      const assistantMessageId = `assistant-${timestamp}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        isComplete: false,
      };

      setLoadingAssistantId(assistantMessageId);
      setMessages((previous) => {
        if (!isMountedRef.current) {
          return previous;
        }
        return [...previous, userMessage, assistantMessage];
      });
      setIsLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

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

      const sanitizedMessagesPayload = [...messages, userMessage].map(
        (message) => ({
          role: message.role,
          content: message.content,
        }),
      );

      const run = async () => {
        try {
          const endpoint = `/api/chat`;
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: trimmed,
              messages: sanitizedMessagesPayload,
              config,
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
            clientChunkIndex += 1;
            if (STREAM_TRACE_LOGGING_ENABLED) {
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

            if (!ttftRecorded && answer.trim().length > 0) {
              ttftRecorded = true;
              updateAssistant(
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {
                  ttftMs: Date.now() - timestamp,
                },
              );
            }
          }

          const [answer, citationsJson] =
            fullContent.split(CITATIONS_SEPARATOR);
          const finalContent = (answer ?? "").trim();
          const parsedPayload = parseCitationPayload(citationsJson);

          if (isMountedRef.current) {
            updateAssistant(
              finalContent,
              guardrailMeta,
              parsedPayload,
              runtimeConfig ?? null,
              true,
            );
          }
        } catch (err) {
          if (!isMountedRef.current) {
            return;
          }
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
      };

      await run();
    },
    [isLoading, messages, runtimeConfig, config],
  );

  return {
    messages,
    isLoading,
    runtimeConfig,
    loadingAssistantId,
    sendMessage,
    abortActiveRequest,
  };
}
