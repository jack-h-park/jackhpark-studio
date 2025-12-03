import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
  type BaseChatModelCallOptions,
  SimpleChatModel,
} from "@langchain/core/language_models/chat_models";
import {
  AIMessageChunk,
  type BaseMessage,
  ChatMessage,
} from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";

import type { LocalLlmMessage, LocalLlmRequest } from "@/lib/local-llm/client";
import { getOllamaRuntimeConfig } from "@/lib/core/ollama";
import { getLocalLlmClient } from "@/lib/local-llm";
import { OllamaUnavailableError } from "@/lib/server/ollama-provider";

const debugOllamaTiming =
  (process.env.DEBUG_OLLAMA_TIMING ?? "").toLowerCase() === "true";
const logOllamaTiming = (durationMs: number, completed: boolean) => {
  if (!debugOllamaTiming) {
    return;
  }
  console.info("[chat-ollama] /api/chat response time", {
    durationMs,
    completed,
  });
};

export type ChatOllamaFields = {
  baseUrl?: string | null;
  model?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
};

export class ChatOllama extends SimpleChatModel<BaseChatModelCallOptions> {
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens: number | null;

  constructor(fields?: ChatOllamaFields) {
    super({});
    const config = getOllamaRuntimeConfig();
    this.model = fields?.model ?? config.defaultModel;
    this.temperature =
      typeof fields?.temperature === "number" &&
      Number.isFinite(fields.temperature)
        ? fields.temperature
        : 0;
    this.maxTokens =
      typeof fields?.maxTokens === "number"
        ? fields.maxTokens
        : config.maxTokens;

  }

  _llmType() {
    return "ollama";
  }

  invocationParams() {
    return {
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    };
  }

  _combineLLMOutput() {
    return {};
  }

  async _call(
    messages: BaseMessage[],
    options: BaseChatModelCallOptions,
    runManager?: CallbackManagerForLLMRun,
  ): Promise<string> {
    let result = "";
    for await (const chunk of this._streamResponseChunks(
      messages,
      options,
      runManager,
    )) {
      const content =
        typeof chunk.message.content === "string" ? chunk.message.content : "";
      result += content;
    }
    return result;
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: BaseChatModelCallOptions,
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const startedAt = Date.now();
    let streamCompleted = false;
    const client = getLocalLlmClient();
    if (!client) {
      throw new OllamaUnavailableError("Local LLM backend is not configured.");
    }

    const request: LocalLlmRequest = {
      model: this.model,
      messages: this.buildLocalMessages(messages),
      temperature: this.temperature,
      maxTokens:
        typeof this.maxTokens === "number" && this.maxTokens > 0
          ? Math.floor(this.maxTokens)
          : undefined,
      signal: options?.signal,
    };

    try {
      for await (const chunk of client.chat(request)) {
        const content = chunk.content ?? "";
        if (content.length === 0) {
          continue;
        }
        streamCompleted = true;
        const generation = new ChatGenerationChunk({
          message: new AIMessageChunk({ content }),
          text: content,
          generationInfo: {},
        });
        yield generation;
        await runManager?.handleLLMNewToken(content);
      }
    } catch (err: any) {
      if (err instanceof OllamaUnavailableError) {
        throw err;
      }
      if (err && typeof err === "object" && err.name === "AbortError") {
        throw new OllamaUnavailableError("Ollama chat request timed out.", {
          cause: err,
        });
      }
      throw new OllamaUnavailableError(
        err instanceof Error ? err.message : "Ollama chat request failed.",
        { cause: err },
      );
    } finally {
      logOllamaTiming(Date.now() - startedAt, streamCompleted);
    }
  }

  private buildLocalMessages(messages: BaseMessage[]): LocalLlmMessage[] {
    const converted: LocalLlmMessage[] = [];
    for (const message of messages) {
      const type = message.getType();
      const role: LocalLlmMessage["role"] =
        type === "ai"
          ? "assistant"
          : type === "human"
            ? "user"
            : type === "system"
              ? "system"
              : ChatMessage.isInstance(message) && message.role === "assistant"
                ? "assistant"
                : "user";
      const content = this.normalizeContent(message.content);
      if (content.length === 0) {
        continue;
      }
      converted.push({ role, content });
    }

    if (converted.length === 0) {
      converted.push({ role: "user", content: "" });
    }

    return converted;
  }

  private normalizeContent(content: unknown): string {
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (!part) return "";
          if (typeof part === "string") {
            return part;
          }
          if (
            typeof part === "object" &&
            "text" in part &&
            typeof (part as any).text === "string"
          ) {
            return (part as { text: string }).text;
          }
          return "";
        })
        .join("");
    }
    if (typeof content === "object" && content && "text" in content) {
      const value = (content as { text?: unknown }).text;
      return typeof value === "string" ? value : "";
    }
    return "";
  }

}
