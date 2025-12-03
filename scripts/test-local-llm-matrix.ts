const BASE_URL = process.env.LOCAL_LLM_TEST_BASE_URL ?? "http://localhost:3000";
const TEST_MODEL = process.env.LOCAL_LLM_TEST_MODEL ?? "mistral";
const TEST_MESSAGE =
  process.env.LOCAL_LLM_TEST_MESSAGE ?? "Hello from the Local LLM smoke test.";
const TEST_PRESET = process.env.LOCAL_LLM_TEST_PRESET ?? "default";

const configs: Array<{ label: string; backend?: string }> = [
  { label: "env", backend: process.env.LOCAL_LLM_BACKEND },
  { label: "ollama", backend: "ollama" },
  { label: "lmstudio", backend: "lmstudio" },
  { label: "unset", backend: undefined },
  { label: "invalid", backend: "invalid" },
].filter((entry, index, all) => {
  if (entry.label === "env") {
    return entry.backend !== undefined;
  }
  return all.findIndex((item) => item.label === entry.label) === index;
});

if (configs.length === 0) {
  throw new Error("No backend configurations found for the Local LLM matrix.");
}

async function run() {
  console.log("Local LLM matrix start");
  for (const config of configs) {
    const original = process.env.LOCAL_LLM_BACKEND;
    if (config.backend === undefined) {
      delete process.env.LOCAL_LLM_BACKEND;
    } else {
      process.env.LOCAL_LLM_BACKEND = config.backend;
    }

    try {
      const result = await callNativeChat();
      printResult(config.label, config.backend, result);
    } catch (err) {
      console.log(
        `[${config.label}] backend=${config.backend ?? "unset"} error=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      if (original === undefined) {
        delete process.env.LOCAL_LLM_BACKEND;
      } else {
        process.env.LOCAL_LLM_BACKEND = original;
      }
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

async function callNativeChat(): Promise<NativeChatResult> {
  const response = await fetch(`${BASE_URL}/api/native_chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TEST_MODEL,
      messages: [{ role: "user", content: TEST_MESSAGE }],
      sessionConfig: { appliedPreset: TEST_PRESET },
    }),
  });

  if (response.status >= 400) {
    const errorBody = await response.text().catch(() => "");
    return {
      status: response.status,
      streaming: false,
      error: errorBody || response.statusText,
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
  const summaryParts = [`status=${result.status}`];
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

await run();

export {};
