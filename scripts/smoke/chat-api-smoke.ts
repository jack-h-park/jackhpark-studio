import process from "node:process";
import { setTimeout as wait } from "node:timers/promises";

type Engine = "langchain" | "native";

type SmokeResult = {
  answerText: string;
  chunkCount: number;
  elapsedMs: number;
  isEventStream: boolean;
  isChunked: boolean;
  cacheHitHeader: string | null;
  traceIdHeader: string | null;
};

type JsonValue = Record<string, unknown> | unknown[] | string | number | null;

type ArgOptions = {
  baseUrl: string;
  engine: Engine;
  timeoutMs: number;
};

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_TIMEOUT_MS = 30_000;
const CITATIONS_SEPARATOR = "\n\n--- begin citations ---\n";

const args = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(args.baseUrl ?? DEFAULT_BASE_URL);
const engine = (args.engine ?? "langchain") as Engine;
const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

const endpoint =
  engine === "native" ? "/api/native_chat" : "/api/langchain_chat";

const baseHeaders = {
  "Content-Type": "application/json",
};

async function run() {
  console.log(`[smoke:chat] baseUrl=${baseUrl} engine=${engine}`);

  const shortPrompt =
    "In 3-4 sentences, explain what this assistant does and how it helps users. End with a short bullet list.";
  const ragPrompt =
    "Summarize Jack's background in enterprise mobility and security. Keep it concise and include citations if available.";

  const failures: string[] = [];

  const tcA = await runCase("TC-A success", () =>
    sendChatRequest(shortPrompt, timeoutMs),
  );
  if (!tcA.ok) {
    failures.push(tcA.error);
  }

  const tcB = await runCase("TC-B cache hit", () =>
    sendChatRequest(shortPrompt, timeoutMs),
  );
  if (tcB.ok) {
    const cacheHit = tcB.result.cacheHitHeader;
    if (cacheHit === null) {
      failures.push(
        "TC-B cache hit: missing x-cache-hit header (enable SMOKE_HEADERS=1 or run in non-production)",
      );
    } else if (cacheHit !== "1") {
      failures.push(`TC-B cache hit: expected x-cache-hit=1, got ${cacheHit}`);
    }
  } else {
    failures.push(tcB.error);
  }

  const tcC = await runCase("TC-C rag-ish prompt", () =>
    sendChatRequest(ragPrompt, timeoutMs),
  );
  if (!tcC.ok) {
    failures.push(tcC.error);
  }

  if (failures.length > 0) {
    console.error("[smoke:chat] failures:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("[smoke:chat] all checks passed");
  }
}

try {
  await run();
} catch (err) {
  console.error("[smoke:chat] unexpected error", err);
  process.exitCode = 1;
}

async function runCase(
  name: string,
  runner: () => Promise<SmokeResult>,
): Promise<{ ok: true; result: SmokeResult } | { ok: false; error: string }> {
  try {
    const result = await runner();
    validateResult(name, result);
    console.log(
      `[smoke:chat] PASS ${name} (${result.elapsedMs}ms, chunks=${result.chunkCount}, cache=${result.cacheHitHeader ?? "n/a"})`,
    );
    if (result.traceIdHeader) {
      console.log(`[smoke:chat] trace id ${result.traceIdHeader}`);
    }
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[smoke:chat] FAIL ${name}: ${message}`);
    return { ok: false, error: `${name}: ${message}` };
  }
}

function validateResult(name: string, result: SmokeResult) {
  if (result.elapsedMs > timeoutMs) {
    throw new Error(
      `${name}: elapsed ${result.elapsedMs}ms exceeded ${timeoutMs}ms timeout`,
    );
  }
  if (result.answerText.length < 50) {
    throw new Error(
      `${name}: answer too short (${result.answerText.length} chars)`,
    );
  }
  if (result.isEventStream && result.chunkCount < 2) {
    throw new Error(`${name}: expected at least 2 SSE chunks`);
  }
  if (!result.isEventStream && result.isChunked && result.chunkCount < 1) {
    throw new Error(`${name}: expected at least 1 streamed chunk`);
  }
}

async function sendChatRequest(
  message: string,
  timeoutMsValue: number,
): Promise<SmokeResult> {
  const controller = new AbortController();
  const timeout = wait(timeoutMsValue).then(() => controller.abort());
  const body = buildRequestBody(message);

  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.status !== 200) {
      const responseText = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status} ${response.statusText} ${responseText}`.trim(),
      );
    }

    const smokeResult = await readResponseBody(response);
    return {
      ...smokeResult,
      elapsedMs: Date.now() - start,
    };
  } finally {
    controller.abort();
    await timeout.catch(() => undefined);
  }
}

async function readResponseBody(response: Response): Promise<SmokeResult> {
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
    const answerText = extractAnswerFromJson(payload);
    return {
      answerText: stripCitations(answerText),
      chunkCount: answerText ? 1 : 0,
      elapsedMs: 0,
      isEventStream,
      isChunked,
      cacheHitHeader,
      traceIdHeader,
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("response body is missing");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let chunkCount = 0;
  let answerText = "";
  let streamFinished = false;

  const recordChunk = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    chunkCount += 1;
    answerText += text;
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
    await reader.cancel().catch(() => {});
  }

  return {
    answerText: stripCitations(answerText),
    chunkCount,
    elapsedMs: 0,
    isEventStream,
    isChunked,
    cacheHitHeader,
    traceIdHeader,
  };
}

function extractChunkText(dataContent: string): string {
  const trimmed = dataContent.trim();
  if (!trimmed) {
    return "";
  }
  const parsed = safeJsonParse(trimmed);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const choices = obj.choices;
    if (Array.isArray(choices)) {
      return choices
        .map((choice) => {
          if (!choice || typeof choice !== "object") {
            return "";
          }
          const choiceObj = choice as Record<string, unknown>;
          const delta = choiceObj.delta as Record<string, unknown> | undefined;
          if (delta && typeof delta.content === "string") {
            return delta.content;
          }
          const message = choiceObj.message as
            | Record<string, unknown>
            | undefined;
          if (message && typeof message.content === "string") {
            return message.content;
          }
          if (typeof choiceObj.text === "string") {
            return choiceObj.text;
          }
          return "";
        })
        .join("");
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

function extractAnswerFromJson(payload: JsonValue): string {
  if (!payload || typeof payload !== "object") {
    return typeof payload === "string" ? payload : "";
  }
  if (Array.isArray(payload)) {
    return (payload as JsonValue[])
      .map((item) => extractAnswerFromJson(item))
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

function stripCitations(text: string): string {
  const index = text.indexOf(CITATIONS_SEPARATOR);
  return index === -1 ? text : text.slice(0, index);
}

function buildRequestBody(message: string) {
  const preset = process.env.SMOKE_CHAT_PRESET;
  const body: Record<string, unknown> = {
    messages: [{ role: "user", content: message }],
  };
  if (preset) {
    body.sessionConfig = { appliedPreset: preset };
  }
  return body;
}

function parseArgs(argv: string[]): Partial<ArgOptions> {
  const result: Partial<ArgOptions> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      continue;
    }
    const [flag, rawValue] = arg.split("=");
    const value = rawValue ?? argv[i + 1];
    switch (flag) {
      case "--baseUrl":
        if (value) {
          result.baseUrl = value;
        }
        break;
      case "--engine":
        if (value === "native" || value === "langchain") {
          result.engine = value;
        }
        break;
      case "--timeoutMs":
        if (value && Number.isFinite(Number(value))) {
          result.timeoutMs = Number(value);
        }
        break;
      default:
        break;
    }
  }
  return result;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function safeJsonParse(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return null;
  }
}
