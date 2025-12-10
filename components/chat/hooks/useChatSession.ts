"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  deserializeGuardrailMeta,
  type GuardrailMeta,
} from "@/lib/shared/guardrail-meta";
import {
  type ChatEngine,
  type ModelProvider,
  normalizeChatEngine,
} from "@/lib/shared/model-provider";
import { type ModelResolutionReason } from "@/lib/shared/model-resolution";
import { type RankerMode, type ReverseRagMode } from "@/lib/shared/rag-config";
import {
  type ChatEngineType,
  type SessionChatConfig,
} from "@/types/chat-config";

const CITATIONS_SEPARATOR = `\n\n--- begin citations ---\n`;
const DEBUG_LANGCHAIN_STREAM =
  process.env.NEXT_PUBLIC_DEBUG_LANGCHAIN_STREAM === "true";

export type Citation = {
  title?: string;
  source_url?: string;
  excerpt_count?: number;
};

export type ChatRuntimeFallbackFrom = {
  type: "local";
  provider: ModelProvider;
  modelId: string;
};

export type ChatRuntimeConfig = {
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
  isLocal: boolean;
  llmEngine: ChatEngineType;
  requireLocal: boolean;
  localBackendAvailable: boolean;
  fallbackFrom?: ChatRuntimeFallbackFrom | null;
};

export type ChatMessage = {
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
        runtime: runtimeConfig ?? undefined,
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

      const sanitizedMessagesPayload = [...messages, userMessage].map(
        (message) => ({
          role: message.role,
          content: message.content,
        }),
      );

      const run = async () => {
        try {
          const activeRuntime = runtimeConfig;
          const runtimeEngine = normalizeChatEngine(
            activeRuntime?.engine ?? "lc",
          );
          const endpoint = `/api/chat`;

          if (runtimeEngine === "lc") {
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
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
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
              if (!isMountedRef.current) return;

              const [answer] = fullContent.split(CITATIONS_SEPARATOR);
              updateAssistant(answer, guardrailMeta);
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
          }
        } catch (err) {
          console.error("[useChatSession] chat request failed", err);
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
