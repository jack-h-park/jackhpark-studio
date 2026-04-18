export type JsonValue =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | null;

export type ChatSmokeResult = {
  answerText: string;
  rawAnswerText: string;
  chunkCount: number;
  elapsedMs: number;
  isEventStream: boolean;
  isChunked: boolean;
  cacheHitHeader: string | null;
  traceIdHeader: string | null;
  hasCitations: boolean;
};

export const CITATIONS_SEPARATOR = "\n\n--- begin citations ---\n";

export async function readChatResponseBody(
  response: Response,
): Promise<ChatSmokeResult> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const isEventStream = contentType.includes("text/event-stream");
  const isJson = contentType.includes("application/json");
  const isChunked =
    response.headers
      .get("transfer-encoding")
      ?.toLowerCase()
      .includes("chunked") ?? false;
  const cacheHitHeader = response.headers.get("x-cache-hit");
  const traceIdHeader = response.headers.get("x-trace-id");

  if (isJson) {
    const text = await response.text();
    const payload = safeJsonParse(text);
    const rawAnswerText = extractAnswerFromJson(payload);
    return {
      answerText: stripCitations(rawAnswerText),
      rawAnswerText,
      chunkCount: rawAnswerText ? 1 : 0,
      elapsedMs: 0,
      isEventStream,
      isChunked,
      cacheHitHeader,
      traceIdHeader,
      hasCitations: hasCitationPayload(rawAnswerText),
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("response body is missing");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let chunkCount = 0;
  let rawAnswerText = "";
  let streamFinished = false;

  const recordChunk = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    chunkCount += 1;
    rawAnswerText += text;
  };

  const handleData = (dataContent: string) => {
    if (dataContent === "[DONE]") {
      streamFinished = true;
      return;
    }
    const extracted = extractChunkText(dataContent);
    if (extracted) {
      recordChunk(extracted);
    }
  };

  const processBuffer = (flush: boolean) => {
    if (!isEventStream) {
      if (buffer) {
        recordChunk(buffer);
        buffer = "";
      }
      return;
    }
    const sections = buffer.split("\n\n");
    const remainder = flush ? "" : (sections.pop() ?? "");
    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) {
        continue;
      }
      const dataLines = trimmed
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"));
      if (dataLines.length === 0) {
        handleData(trimmed);
        continue;
      }
      const dataContent = dataLines
        .map((line) => line.replace(/^data:\s*/, ""))
        .join("\n");
      handleData(dataContent);
    }
    buffer = remainder;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        processBuffer(false);
      }
      if (done || streamFinished) {
        break;
      }
    }
    processBuffer(true);
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return {
    answerText: stripCitations(rawAnswerText),
    rawAnswerText,
    chunkCount,
    elapsedMs: 0,
    isEventStream,
    isChunked,
    cacheHitHeader,
    traceIdHeader,
    hasCitations: hasCitationPayload(rawAnswerText),
  };
}

export function extractChunkText(dataContent: string): string {
  const trimmed = dataContent.trim();
  if (!trimmed) {
    return "";
  }
  const parsed = safeJsonParse(trimmed);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const choices = obj.choices;
    if (Array.isArray(choices)) {
      return choices.map(extractChoiceText).join("");
    }
    if (typeof obj.content === "string") {
      return obj.content;
    }
    if (typeof obj.text === "string") {
      return obj.text;
    }
  }
  return trimmed;
}

function extractChoiceText(choice: unknown): string {
  if (!choice || typeof choice !== "object") {
    return "";
  }
  const choiceObj = choice as Record<string, unknown>;
  const delta = choiceObj.delta as Record<string, unknown> | undefined;
  if (delta && typeof delta.content === "string") {
    return delta.content;
  }
  const message = choiceObj.message as Record<string, unknown> | undefined;
  if (message && typeof message.content === "string") {
    return message.content;
  }
  if (typeof choiceObj.text === "string") {
    return choiceObj.text;
  }
  return "";
}

export function extractAnswerFromJson(payload: JsonValue): string {
  if (!payload || typeof payload !== "object") {
    return typeof payload === "string" ? payload : "";
  }
  if (Array.isArray(payload)) {
    return payload
      .map((item) => extractAnswerFromJson(item as JsonValue))
      .join(" ");
  }
  const obj = payload as Record<string, unknown>;
  const candidates = [
    obj.answer,
    obj.output,
    obj.text,
    obj.content,
    obj.message,
    obj.data,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      return candidate;
    }
  }
  if (obj.message && typeof obj.message === "object") {
    const messageObj = obj.message as Record<string, unknown>;
    if (typeof messageObj.content === "string") {
      return messageObj.content;
    }
  }
  return "";
}

export function stripCitations(text: string): string {
  const index = text.indexOf(CITATIONS_SEPARATOR);
  return index === -1 ? text : text.slice(0, index);
}

export function hasCitationPayload(text: string): boolean {
  return text.includes(CITATIONS_SEPARATOR);
}

export function safeJsonParse(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return null;
  }
}
