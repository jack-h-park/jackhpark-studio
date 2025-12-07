import "node:process";

const BASE_URL = process.env.LOCAL_LLM_TEST_BASE_URL ?? "http://localhost:3000";
const TEST_MODEL = process.env.LOCAL_LLM_TEST_MODEL ?? "mistral-ollama";
const PRESET_KEY = process.env.LOCAL_LLM_TEST_PRESET ?? "local-required";
const BACKENDS = ["ollama", "lmstudio"] as const;

type Backend = (typeof BACKENDS)[number];
type ChatMessageLike = { role: "user" | "assistant"; content: string };

interface ChatPayload {
  messages: ChatMessageLike[];
}

interface DeepTestCase {
  id: string;
  description: string;
  buildPayload: () => ChatPayload;
}

interface CaseResult {
  id: string;
  status: number | null;
  chunkCount: number;
  totalChars: number;
  firstChunkPreview: string;
  timeToFirstChunkMs: number;
  totalDurationMs: number;
  inputLength?: number;
  outputLength?: number;
  error?: string;
}

type StreamResult = {
  ok: boolean;
  status: number;
  chunkCount: number;
  firstChunk: string;
  fullText: string;
  timeToFirstChunkMs: number;
  totalDurationMs: number;
};

const LONG_SENTENCE =
  "This sentence is repeated to build a fat prompt that should exercise long-input handling.";
const LONG_PROMPT = Array.from({ length: 60 }, () => LONG_SENTENCE).join(" ");

const TEST_CASES: DeepTestCase[] = [
  {
    id: "short-chat",
    description: "Basic short message to verify streaming starts and we receive at least one chunk.",
    buildPayload: () => ({
      messages: [
        {
          role: "user",
          content: "Hello! This is a short sanity check for the local LLM.",
        },
      ],
    }),
  },
  {
    id: "long-chat",
    description: "Long prompt that should produce a longer response and multiple chunks.",
    buildPayload: () => ({
      messages: [
        {
          role: "user",
          content: `Please summarize the following repeated sentence for the local LLM test: ${LONG_PROMPT}`,
        },
      ],
    }),
  },
  {
    id: "rag-knowledge",
    description: "RAG-related prompt that should trigger retrieval but not fail.",
    buildPayload: () => ({
      messages: [
        {
          role: "user",
          content:
            "Explain what Jack's website is about and how the AI assistant is supposed to help visitors. Keep it concise.",
        },
      ],
    }),
  },
  {
    id: "multi-turn",
    description: "Simulated conversation with multiple turns to exercise context retention.",
    buildPayload: () => ({
      messages: [
        { role: "user", content: "Hi, I'm testing the local LLM." },
        {
          role: "assistant",
          content: "Happy to help. Let me know what you need from the assistant.",
        },
        {
          role: "user",
          content: "Can you remind me what we were just talking about, in one sentence?",
        },
      ],
    }),
  },
];

async function run() {
  console.log("Local LLM deep test start");

  for (const backend of BACKENDS) {
    const summaries: CaseResult[] = [];
    for (const testCase of TEST_CASES) {
      const result = await runTestCase(backend, testCase);
      summaries.push(result);
      logCaseResult(backend, result);
    }
    printBackendSummary(backend, summaries);
  }

  console.log("Local LLM deep test complete");
}

async function runTestCase(backend: Backend, testCase: DeepTestCase): Promise<CaseResult> {
  const payload = testCase.buildPayload();
  const inputLength = payload.messages.reduce((sum, msg) => sum + msg.content.length, 0);

  const startTime = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/api/native_chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-local-llm-backend": backend,
      },
      body: JSON.stringify({
        model: TEST_MODEL,
        messages: payload.messages,
        sessionConfig: {
          appliedPreset: PRESET_KEY,
        },
      }),
    });

    if (response.status >= 400) {
      const errorBody = await response.text().catch(() => "");
      const parsedError = parseErrorMessage(errorBody, response.statusText);
      const elapsed = Date.now() - startTime;
      return {
        id: testCase.id,
        status: response.status,
        chunkCount: 0,
        totalChars: 0,
        firstChunkPreview: "",
        timeToFirstChunkMs: elapsed,
        totalDurationMs: elapsed,
        inputLength,
        outputLength: 0,
        error: parsedError,
      };
    }

    const streamResult = await collectStreamResult(response);
    return {
      id: testCase.id,
      status: streamResult.status,
      chunkCount: streamResult.chunkCount,
      totalChars: streamResult.fullText.length,
      firstChunkPreview: previewChunk(streamResult.firstChunk),
      timeToFirstChunkMs: streamResult.timeToFirstChunkMs,
      totalDurationMs: streamResult.totalDurationMs,
      inputLength,
      outputLength: streamResult.fullText.length,
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    return {
      id: testCase.id,
      status: null,
      chunkCount: 0,
      totalChars: 0,
      firstChunkPreview: "",
      timeToFirstChunkMs: elapsed,
      totalDurationMs: elapsed,
      inputLength,
      outputLength: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function collectStreamResult(response: Response): Promise<StreamResult> {
  const start = Date.now();
  if (!response.body) {
    const duration = Date.now() - start;
    return {
      ok: response.ok,
      status: response.status,
      chunkCount: 0,
      firstChunk: "",
      fullText: "",
      timeToFirstChunkMs: duration,
      totalDurationMs: duration,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let chunkCount = 0;
  let fullText = "";
  let firstChunk = "";
  let firstChunkTime: number | null = null;
  let streamFinished = false;

  const recordChunk = (text: string) => {
    if (!text.trim()) {
      return;
    }
    if (chunkCount === 0) {
      firstChunk = text;
      firstChunkTime = Date.now() - start;
    }
    chunkCount += 1;
    fullText += text;
  };

  const processBuffer = (flush: boolean) => {
    const sections = buffer.split("\n\n");
    const remainder = flush ? "" : sections.pop() ?? "";

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
        recordChunk(trimmed);
        continue;
      }

      const dataContent = dataLines
        .map((line) => line.replace(/^data:\s*/, ""))
        .join("\n");

      if (dataContent === "[DONE]") {
        streamFinished = true;
        continue;
      }

      try {
        const parsed = JSON.parse(dataContent);
        const chunkText = extractChunkText(parsed);
        if (chunkText) {
          recordChunk(chunkText);
        }
      } catch {
        recordChunk(dataContent);
      }
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

  const totalDurationMs = Date.now() - start;
  const timeToFirstChunkMs = firstChunkTime ?? totalDurationMs;
  return {
    ok: response.ok,
    status: response.status,
    chunkCount,
    firstChunk,
    fullText,
    timeToFirstChunkMs,
    totalDurationMs,
  };
}

function extractChunkText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const { choices } = payload as { choices?: unknown };
  if (!Array.isArray(choices)) {
    return "";
  }
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
      const message = choiceObj.message as Record<string, unknown> | undefined;
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

function previewChunk(chunk: string): string {
  const singleLine = chunk.replaceAll(/\s+/g, " ").trim();
  if (!singleLine) {
    return "";
  }
  return singleLine.length > 80 ? singleLine.slice(0, 80) : singleLine;
}

function parseErrorMessage(body: string, statusText: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return statusText;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const candidate = parsed as { error?: unknown };
      if (typeof candidate.error === "string") {
        return candidate.error;
      }
    }
  } catch {
    // ignore JSON parse errors
  }
  return trimmed;
}

function logCaseResult(backend: Backend, result: CaseResult) {
  const statusLabel = result.status !== null ? result.status : "error";
  const streamingLabel = result.chunkCount > 0 ? "streaming=true" : "streaming=false";
  const parts = [
    `status=${statusLabel}`,
    `chunks=${result.chunkCount}`,
    streamingLabel,
    `ttfb=${result.timeToFirstChunkMs}ms`,
    `total=${result.totalDurationMs}ms`,
    `chars=${result.totalChars}`,
  ];

  if (result.inputLength !== undefined && result.id === "long-chat") {
    parts.push(`input=${result.inputLength}`);
  }
  if (result.outputLength !== undefined && result.id === "long-chat") {
    parts.push(`output=${result.outputLength}`);
  }

  console.log(`[backend=${backend}] case=${result.id} ${parts.join(" ")}`);

  if (result.firstChunkPreview) {
    console.log(`  firstChunk="${result.firstChunkPreview}"`);
  }

  if (result.error) {
    console.log(
      `  error="${result.error.replaceAll(/\s+/g, " ").trim()}"`,
    );
  }
}

function printBackendSummary(backend: Backend, summaries: CaseResult[]) {
  console.log(`Summary for backend=${backend}:`);
  for (const summary of summaries) {
    const statusLabel = summary.status !== null ? `(${summary.status})` : "(error)";
    const outcome = summary.error ? "FAIL" : "OK";
    console.log(
      `  ${summary.id}: ${outcome} ${statusLabel}  chunks=${summary.chunkCount}  total=${summary.totalDurationMs}ms`,
    );
  }
}

try {
  await run();
} catch (err) {
  console.error("[test-local-llm-deep] unexpected error", err);
  throw err;
}
