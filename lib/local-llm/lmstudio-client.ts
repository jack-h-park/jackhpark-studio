import type { LocalLlmClient, LocalLlmRequest, LocalLlmResponseChunk } from "./client";

const DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";

export class LmStudioClient implements LocalLlmClient {
  constructor(
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    private readonly apiKey?: string,
  ) {}

  async *chat(request: LocalLlmRequest): AsyncIterable<LocalLlmResponseChunk> {
    const url = this.buildUrl();
    const payload = this.buildPayload(request);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: request.signal,
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `LM Studio chat request failed (${response.status} ${response.statusText}). ${errorText}`.trim(),
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let ended = false;

    try {
      while (!ended) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const extracted = this.collectLines(buffer);
        buffer = extracted.remainder;
        for (const line of extracted.lines) {
          if (this.isDoneLine(line)) {
            ended = true;
            break;
          }
          const content = this.extractContentFromLine(line);
          if (content.length > 0) {
            yield { content, done: false };
          }
        }
      }

      buffer += decoder.decode();
      const finalLines = this.collectLines(buffer, { flush: true });
      for (const line of finalLines.lines) {
        if (this.isDoneLine(line)) {
          break;
        }
        const content = this.extractContentFromLine(line);
        if (content.length > 0) {
          yield { content, done: false };
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: "", done: true };
  }

  private buildUrl(): string {
    const normalized = this.baseUrl.replace(/\/$/, "");
    return `${normalized}/chat/completions`;
  }

  private buildPayload(request: LocalLlmRequest): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      stream: true,
    };

    if (typeof request.temperature === "number") {
      payload.temperature = request.temperature;
    }
    if (typeof request.maxTokens === "number" && request.maxTokens > 0) {
      payload.max_tokens = Math.floor(request.maxTokens);
    }
    if (typeof request.topP === "number") {
      payload.top_p = request.topP;
    }
    if (request.stop) {
      payload.stop = request.stop;
    }

    return payload;
  }

  private collectLines(
    buffer: string,
    options?: { flush?: boolean },
  ): { lines: string[]; remainder: string } {
    const lines: string[] = [];
    let remainder = buffer;
    let newlineIndex = remainder.indexOf("\n");

    while (newlineIndex !== -1) {
      const line = remainder.slice(0, newlineIndex).trim();
      remainder = remainder.slice(newlineIndex + 1);
      if (line.length > 0) {
        lines.push(line);
      }
      newlineIndex = remainder.indexOf("\n");
    }

    if (options?.flush) {
      const trailing = remainder.trim();
      if (trailing.length > 0) {
        lines.push(trailing);
        remainder = "";
      }
    }

    return { lines, remainder };
  }

  private isDoneLine(line: string): boolean {
    const normalized = this.normalizeLine(line);
    return normalized === "[DONE]";
  }

  private extractContentFromLine(line: string): string {
    const normalized = this.normalizeLine(line);
    if (!normalized || normalized === "[DONE]") {
      return "";
    }

    let payload: unknown;
    try {
      payload = JSON.parse(normalized);
    } catch {
      return "";
    }

    const error = (payload as { error?: unknown }).error;
    if (error) {
      throw new Error(
        typeof error === "string" ? error : JSON.stringify(error),
      );
    }

    const candidate = payload as { choices?: unknown[] };
    if (!Array.isArray(candidate.choices) || candidate.choices.length === 0) {
      return "";
    }

    const first = candidate.choices[0] as {
      delta?: { content?: string };
      text?: string;
    };

    if (first.delta && typeof first.delta.content === "string") {
      return first.delta.content;
    }

    if (typeof first.text === "string") {
      return first.text;
    }

    return "";
  }

  private normalizeLine(line: string): string {
    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) {
      return trimmed.slice(5).trim();
    }
    return trimmed;
  }
}
