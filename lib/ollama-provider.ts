import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from "@ai-sdk/provider";

import type { ChatMessage } from "@/lib/server/chat-messages";
import { getDefaultOllamaModelId } from "@/lib/core/ollama";
import { streamOllamaChat } from "@/lib/server/ollama-provider";

type OllamaStreamOptions = Parameters<typeof streamOllamaChat>[0];

const DEFAULT_TEMPERATURE = 0.3;
const UNKNOWN_USAGE: LanguageModelV2Usage = {
  inputTokens: undefined,
  outputTokens: undefined,
  totalTokens: undefined,
};

export function ollamaModel(modelId?: string): LanguageModelV2 {
  const resolvedModelId = resolveModelId(modelId);

  return {
    specificationVersion: "v2",
    provider: "ollama",
    modelId: resolvedModelId,
    supportedUrls: {},
    async doGenerate(options: LanguageModelV2CallOptions) {
      const generator = streamOllamaChat(buildStreamOptions(resolvedModelId, options));
      const chunks: string[] = [];

      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      const text = chunks.join("");
      return {
        content: text
          ? [
              {
                type: "text" as const,
                text,
              },
            ]
          : [],
        finishReason: "stop",
        usage: UNKNOWN_USAGE,
        warnings: [],
      };
    },
    async doStream(options: LanguageModelV2CallOptions) {
      const generator = streamOllamaChat(buildStreamOptions(resolvedModelId, options));
      const textId = `ollama-text-${Date.now().toString(36)}`;

      const stream = new ReadableStream<LanguageModelV2StreamPart>({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: textId });

          (async () => {
            try {
              for await (const chunk of generator) {
                if (chunk.length === 0) {
                  continue;
                }
                controller.enqueue({
                  type: "text-delta",
                  id: textId,
                  delta: chunk,
                });
              }

              controller.enqueue({ type: "text-end", id: textId });
              controller.enqueue({
                type: "finish",
                finishReason: "stop",
                usage: UNKNOWN_USAGE,
              });
              controller.close();
            } catch (err) {
              controller.enqueue({ type: "error", error: err });
              controller.error(err);
            }
          })();
        },
        cancel() {
          if (typeof generator.return === "function") {
            generator.return(undefined).catch(() => {
              // ignore cancellation errors
            });
          }
        },
      });

      return { stream };
    },
  };
}

function resolveModelId(modelId?: string): string {
  if (typeof modelId === "string" && modelId.trim().length > 0) {
    return modelId.trim();
  }
  return getDefaultOllamaModelId();
}

function buildStreamOptions(
  modelId: string,
  callOptions: LanguageModelV2CallOptions,
): OllamaStreamOptions {
  const { systemPrompt, chatMessages } = convertPrompt(callOptions.prompt);

  return {
    model: modelId,
    systemPrompt,
    messages: chatMessages,
    temperature: callOptions.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: callOptions.maxOutputTokens ?? 0,
    stream: true,
  };
}

function convertPrompt(prompt: LanguageModelV2Prompt | undefined): {
  systemPrompt: string;
  chatMessages: ChatMessage[];
} {
  const systemSegments: string[] = [];
  const chatMessages: ChatMessage[] = [];

  for (const entry of prompt ?? []) {
    if (!entry) continue;

    if (entry.role === "system") {
      const text = typeof entry.content === "string" ? entry.content : "";
      if (text.trim().length > 0) {
        systemSegments.push(text.trim());
      }
      continue;
    }

    if (entry.role === "user" || entry.role === "assistant") {
      const text = flattenContent(entry.content);
      if (text.length > 0) {
        chatMessages.push({ role: entry.role, content: text });
      }
      continue;
    }

    if (entry.role === "tool") {
      const text = flattenContent(entry.content);
      if (text.length > 0) {
        chatMessages.push({
          role: "assistant",
          content: `[tool-result]\n${text}`,
        });
      }
    }
  }

  return {
    systemPrompt: systemSegments.join("\n\n"),
    chatMessages,
  };
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  for (const part of content) {
    const normalized = normalizeContentPart(part);
    if (normalized.length > 0) {
      parts.push(normalized);
    }
  }

  return parts.join("\n").trim();
}

function normalizeContentPart(part: unknown): string {
  if (!part) {
    return "";
  }

  if (typeof part === "string") {
    return part.trim();
  }

  if (typeof part !== "object") {
    return "";
  }

  const candidate = part as Record<string, unknown>;

  if (typeof candidate.text === "string") {
    return candidate.text.trim();
  }

  if (candidate.type === "tool-call") {
    const name = typeof candidate.toolName === "string" ? candidate.toolName : "tool";
    const input = typeof candidate.input === "string" ? candidate.input : JSON.stringify(candidate.input ?? {});
    return `[tool-call:${name}] ${input}`.trim();
  }

  if (candidate.type === "tool-result") {
    const name = typeof candidate.toolName === "string" ? candidate.toolName : "tool";
    return `[tool-result:${name}] ${stringify(candidate.result)}`.trim();
  }

  if (candidate.type === "reasoning" && typeof candidate.text === "string") {
    return candidate.text.trim();
  }

  if (candidate.type === "file") {
    const mediaType = typeof candidate.mediaType === "string" ? candidate.mediaType : "file";
    return `[file:${mediaType}]`;
  }

  if (candidate.type === "source") {
    const title = typeof candidate.title === "string" ? candidate.title : candidate.id;
    const url = typeof candidate.url === "string" ? candidate.url : "";
    return `[source:${title ?? "source"}] ${url}`.trim();
  }

  try {
    return JSON.stringify(part);
  } catch {
    return "";
  }
}

function stringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
