import type { ChatMessage } from "@/lib/server/chat-messages";
import {
  getOllamaRuntimeConfig,
  type OllamaRuntimeConfig,
} from "@/lib/core/ollama";

export const OLLAMA_UNAVAILABLE_ERROR_CODE = "OLLAMA_UNAVAILABLE";
export const OLLAMA_UNAVAILABLE_ERROR_MESSAGE =
  "Ollama (로컬 LLM) 서버에 연결할 수 없습니다. 설정과 서버 상태를 확인해 주세요.";

export class OllamaUnavailableError extends Error {
  code = OLLAMA_UNAVAILABLE_ERROR_CODE;
  clientMessage = OLLAMA_UNAVAILABLE_ERROR_MESSAGE;

  constructor(message?: string, options?: { cause?: unknown }) {
    super(message ?? OLLAMA_UNAVAILABLE_ERROR_MESSAGE);
    if (options?.cause) {
      this.cause = options.cause;
    }
    this.name = "OllamaUnavailableError";
  }
}

export type OllamaChatStreamOptions = {
  model?: string | null;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  messages: ChatMessage[];
  stream?: boolean;
};

export async function* streamOllamaChat(
  options: OllamaChatStreamOptions,
): AsyncGenerator<string> {
  const config = getOllamaRuntimeConfig();
  if (!config.enabled || !config.baseUrl) {
    throw new OllamaUnavailableError(
      "Ollama provider is disabled in this environment.",
    );
  }

  const resolvedModel = normalizeModel(options.model, config.defaultModel);
  if (!resolvedModel) {
    throw new OllamaUnavailableError(
      "No Ollama model is configured. Set OLLAMA_MODEL_DEFAULT or provide a model id.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const payload = buildPayload(options, resolvedModel, config);

  try {
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const errorPayload = await safeReadError(response);
      throw createUnavailableError(
        `Ollama chat request failed (${response.status} ${response.statusText}). ${errorPayload}`,
        { baseUrl: config.baseUrl, model: resolvedModel },
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const { remainder, chunks } = drainBuffer(
        buffer,
        config.baseUrl,
        resolvedModel,
      );
      buffer = remainder;
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    buffer += decoder.decode();
    const { chunks: finalChunks } = drainBuffer(
      buffer,
      config.baseUrl,
      resolvedModel,
      true,
    );
    for (const chunk of finalChunks) {
      yield chunk;
    }
  } catch (err: any) {
    if (err instanceof OllamaUnavailableError) {
      throw err;
    }
    if (err && typeof err === "object" && err.name === "AbortError") {
      throw createUnavailableError("Ollama chat request timed out.", {
        baseUrl: config.baseUrl,
        model: resolvedModel,
        cause: err,
      });
    }
    throw createUnavailableError(
      err instanceof Error ? err.message : "Ollama chat request failed.",
      { baseUrl: config.baseUrl, model: resolvedModel, cause: err },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildPayload(
  options: OllamaChatStreamOptions,
  model: string,
  config: OllamaRuntimeConfig,
): Record<string, unknown> {
  const messages = buildMessages(options.systemPrompt, options.messages);
  const maxPredict = resolveMaxTokens(options.maxTokens, config.maxTokens);
  const payload: Record<string, unknown> = {
    model,
    messages,
    stream: options.stream !== false,
  };

  const requestOptions: Record<string, number> = {};
  if (Number.isFinite(options.temperature)) {
    requestOptions.temperature = options.temperature;
  }
  if (maxPredict > 0) {
    requestOptions.num_predict = maxPredict;
  }
  if (Object.keys(requestOptions).length > 0) {
    payload.options = requestOptions;
  }

  return payload;
}

function buildMessages(systemPrompt: string, messages: ChatMessage[]) {
  const normalizedSystem = systemPrompt?.trim() ?? "";
  const result: Array<{
    role: "system" | ChatMessage["role"];
    content: string;
  }> = [];
  if (normalizedSystem.length > 0) {
    result.push({ role: "system", content: normalizedSystem });
  }
  for (const message of messages) {
    if (!message?.content?.trim()) {
      continue;
    }
    result.push({ role: message.role, content: message.content });
  }
  return result;
}

function resolveMaxTokens(requestMax: number, envMax: number | null) {
  const candidates: number[] = [];
  if (typeof requestMax === "number" && Number.isFinite(requestMax)) {
    candidates.push(requestMax);
  }
  if (typeof envMax === "number" && Number.isFinite(envMax)) {
    candidates.push(envMax);
  }
  if (!candidates.length) {
    return 0;
  }
  const min = Math.min(...candidates);
  return min > 0 ? Math.floor(min) : 0;
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text?.trim() ?? "";
  } catch {
    return "";
  }
}

function normalizeModel(
  candidate: string | null | undefined,
  fallback: string,
) {
  if (candidate && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return fallback?.trim() ?? "";
}

function drainBuffer(
  buffer: string,
  baseUrl: string,
  model: string,
  flush = false,
): { remainder: string; chunks: string[] } {
  const chunks: string[] = [];
  let remainder = buffer;
  let newlineIndex = remainder.indexOf("\n");

  while (newlineIndex !== -1) {
    const line = remainder.slice(0, newlineIndex).trim();
    remainder = remainder.slice(newlineIndex + 1);
    if (line.length > 0) {
      const chunk = processLine(line, baseUrl, model);
      if (chunk) {
        chunks.push(chunk);
      }
    }
    newlineIndex = remainder.indexOf("\n");
  }

  if (flush && remainder.trim().length > 0) {
    const finalChunk = processLine(remainder.trim(), baseUrl, model);
    if (finalChunk) {
      chunks.push(finalChunk);
    }
    remainder = "";
  }

  return { remainder, chunks };
}

type OllamaChunkPayload = {
  done?: boolean;
  message?: { content?: string };
  response?: string;
  error?: string;
};

function processLine(
  line: string,
  baseUrl: string,
  model: string,
): string | null {
  let payload: OllamaChunkPayload;
  try {
    payload = JSON.parse(line) as OllamaChunkPayload;
  } catch (err) {
    console.warn("[ollama] failed to parse stream chunk", { line, error: err });
    return null;
  }

  if (payload?.error) {
    throw createUnavailableError(payload.error, { baseUrl, model });
  }

  const text = payload?.message?.content ?? payload?.response ?? "";
  return typeof text === "string" && text.length > 0 ? text : null;
}

function createUnavailableError(
  message: string,
  context: { baseUrl: string; model: string; cause?: unknown },
): OllamaUnavailableError {
  console.error("[ollama] request failed", {
    provider: "ollama",
    baseUrl: context.baseUrl,
    model: context.model,
    error: message,
    cause:
      context.cause instanceof Error
        ? context.cause.message
        : (context.cause ?? null),
  });
  return new OllamaUnavailableError(message, { cause: context.cause });
}
