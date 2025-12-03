export type LocalLlmBackend = "ollama" | "lmstudio";

export type LocalLlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LocalLlmRequest = {
  model: string;
  messages: LocalLlmMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string | string[];
  signal?: AbortSignal;
};

export type LocalLlmResponseChunk = {
  content: string;
  done: boolean;
};

export interface LocalLlmClient {
  /**
   * Stream chat completion chunks. Must always yield ordered chunks for a single completion.
   */
  chat(request: LocalLlmRequest): AsyncIterable<LocalLlmResponseChunk>;
}
