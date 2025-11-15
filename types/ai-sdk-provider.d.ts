declare module "@ai-sdk/provider" {
  export type LanguageModelV2Usage = {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };

  export type LanguageModelV2StreamPart =
    | { type: "stream-start"; warnings: unknown[] }
    | { type: "text-start"; id: string }
    | { type: "text-delta"; id: string; delta: string }
    | { type: "text-end"; id: string }
    | { type: "finish"; finishReason: string; usage: LanguageModelV2Usage }
    | { type: "error"; error: unknown };

  export type LanguageModelV2Prompt = Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: unknown;
  }>;

  export type LanguageModelV2CallOptions = {
    prompt?: LanguageModelV2Prompt;
    temperature?: number;
    maxOutputTokens?: number;
  };

  export type LanguageModelV2 = {
    specificationVersion: "v2";
    provider: string;
    modelId: string;
    supportedUrls: Record<string, RegExp[]>;
    doGenerate(
      options: LanguageModelV2CallOptions,
    ): PromiseLike<{
      content: Array<{ type: "text"; text: string }>;
      finishReason: string;
      usage: LanguageModelV2Usage;
      warnings: unknown[];
    }>;
    doStream(
      options: LanguageModelV2CallOptions,
    ): PromiseLike<{ stream: ReadableStream<LanguageModelV2StreamPart> }>;
  };
}
