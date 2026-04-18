import process from "node:process";

import {
  type ChatSmokeResult,
  readChatResponseBody,
} from "./lib/chat-response";
import { normalizeBaseUrl, withAbortTimeout } from "./lib/smoke-core";

type SmokeResult = ChatSmokeResult;

type ArgOptions = {
  baseUrl: string;
  timeoutMs: number;
};

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_TIMEOUT_MS = 30_000;
const args = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(args.baseUrl ?? DEFAULT_BASE_URL);
const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

const endpoint = "/api/chat";

const baseHeaders = {
  "Content-Type": "application/json",
};

async function run() {
  console.log(`[smoke:chat] baseUrl=${baseUrl} endpoint=${endpoint}`);

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
  if (tcC.ok) {
    if (!tcC.result.hasCitations) {
      failures.push(
        "TC-C rag-ish prompt: missing citations payload separator in response",
      );
    }
  } else {
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
  const body = buildRequestBody(message);

  const start = Date.now();
  return withAbortTimeout(timeoutMsValue, async (signal) => {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(body),
      signal,
    });

    if (response.status !== 200) {
      const responseText = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status} ${response.statusText} ${responseText}`.trim(),
      );
    }

    const smokeResult = await readChatResponseBody(response);
    return {
      ...smokeResult,
      elapsedMs: Date.now() - start,
    };
  });
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
