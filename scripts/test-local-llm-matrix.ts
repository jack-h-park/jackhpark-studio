import "node:process";

const BASE_URL = process.env.LOCAL_LLM_TEST_BASE_URL ?? "http://localhost:3000";
const TEST_MODEL = process.env.LOCAL_LLM_TEST_MODEL ?? "mistral-ollama";
const TEST_MESSAGE =
  process.env.LOCAL_LLM_TEST_MESSAGE ?? "Hello from the Local LLM smoke test.";
const TEST_PRESET = process.env.LOCAL_LLM_TEST_PRESET ?? "local-required";
const TEST_REQUIRE_LOCAL =
  (process.env.LOCAL_LLM_TEST_REQUIRE_LOCAL ?? "true").toLowerCase() !==
  "false";

const configs: Array<{ label: string; backend: string | undefined }> = [
  { label: "ollama", backend: "ollama" },
  { label: "lmstudio", backend: "lmstudio" },
  { label: "unset", backend: "unset" },
  { label: "invalid", backend: "invalid" },
];

async function run() {
  console.log("Local LLM matrix start");
  for (const config of configs) {
    try {
      const result = await callNativeChat(config.backend);
      printResult(config.label, config.backend, result);
    } catch (err) {
      console.log(
        `[${config.label}] backend=${config.backend ?? "unset"} error=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  console.log("Local LLM matrix complete");
}

interface NativeChatResult {
  status: number;
  streaming: boolean;
  chunk?: string;
  error?: string;
}

async function callNativeChat(backendOverride?: string): Promise<NativeChatResult> {
  const response = await fetch(`${BASE_URL}/api/native_chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(backendOverride
        ? { "x-local-llm-backend": backendOverride }
        : {}),
    },
    body: JSON.stringify({
      model: TEST_MODEL,
      messages: [{ role: "user", content: TEST_MESSAGE }],
      sessionConfig: {
        appliedPreset: TEST_PRESET,
      },
    }),
  });

  if (response.status >= 400) {
    const errorBody = await response.text().catch(() => "");
    let parsedError = errorBody || response.statusText;
    if (errorBody) {
      try {
        const decoded = JSON.parse(errorBody);
        if (decoded && typeof decoded === "object") {
          const candidate = decoded as { error?: unknown };
          if (typeof candidate.error === "string") {
            parsedError = candidate.error;
          }
        }
      } catch {
        // ignore JSON parse errors
      }
    }
    return {
      status: response.status,
      streaming: false,
      error: parsedError,
    };
  }

  if (!response.body) {
    return { status: response.status, streaming: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let chunk = "";
  let streaming = false;

  try {
    const { value, done } = await reader.read();
    if (!done && value) {
      streaming = true;
      chunk = decoder.decode(value, { stream: true }).trim();
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return { status: response.status, streaming, chunk };
}

function printResult(label: string, backend: string | undefined, result: NativeChatResult) {
  const backendLabel = backend ?? "unset";
  const summaryParts = [`status=${result.status}`, `requireLocal=${TEST_REQUIRE_LOCAL}`];
  if (result.streaming) {
    summaryParts.push("streaming=true");
  }
  if (result.chunk) {
    summaryParts.push(`chunk="${result.chunk.slice(0, 80)}"`);
  }
  if (result.error) {
    summaryParts.push(`error="${result.error.replaceAll(/\s+/g, " ").trim()}"`);
  }
  console.log(`[${label}] backend=${backendLabel} ${summaryParts.join(", ")}`);
}

try {
  await run();
} catch (err) {
  console.error("[test-local-llm-matrix] unexpected error", err);
  throw err;
}
