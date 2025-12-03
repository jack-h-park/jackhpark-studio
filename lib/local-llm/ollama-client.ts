import type { ChatMessage } from "@/lib/server/chat-messages";
import { streamOllamaChat } from "@/lib/server/ollama-provider";

import type {
  LocalLlmClient,
  LocalLlmRequest,
  LocalLlmResponseChunk,
} from "./client";

export class OllamaClient implements LocalLlmClient {
  constructor(private readonly baseUrl: string) {}

  async *chat(request: LocalLlmRequest): AsyncIterable<LocalLlmResponseChunk> {
    const systemPrompt = this.buildSystemPrompt(request.messages);
    const chatMessages = this.buildChatMessages(request.messages);
    const streamOptions = {
      model: request.model,
      temperature: request.temperature ?? 0,
      maxTokens: request.maxTokens ?? 0,
      systemPrompt,
      messages: chatMessages,
      stream: true,
    };

    for await (const chunk of streamOllamaChat(streamOptions)) {
      if (!chunk) {
        continue;
      }
      yield { content: chunk, done: false };
    }

    yield { content: "", done: true };
  }

  private buildSystemPrompt(messages: LocalLlmRequest["messages"]): string {
    return messages
      .filter((message) => message.role === "system")
      .map((message) => message.content.trim())
      .filter((content) => content.length > 0)
      .join("\n\n");
  }

  private buildChatMessages(messages: LocalLlmRequest["messages"]): ChatMessage[] {
    return messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
  }
}
