// scripts/local-llm-bakeoff/record-fixture.ts
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { readChatResponseBody } from "../smoke/lib/chat-response";
import { buildFixture } from "./fixture.mjs";
import { assertOutsideRepo } from "./private-path.mjs";
import { STUB_ANSWER } from "./recorder.mjs";
import { readJsonl } from "./results-store.mjs";

// The catalog's LM Studio entry; which model it names does not matter,
// because the recorder answers every request itself.
const LOCAL_MODEL_ID = "mistral-lmstudio";
const REFERENCE_VARIANT = "gpt-6-luna";
const REQUEST_TIMEOUT_MS = 120_000;

type ChatTurn = { role: "user" | "assistant"; content: string };
type Question = {
  id: string;
  lang: "en" | "ko";
  kind: "project" | "out_of_scope" | "multi_turn";
  turns: ChatTurn[];
};

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const { values } = parseArgs({
  options: {
    pass: { type: "string" },
    app: { type: "string", default: "http://localhost:3000" },
    recorder: { type: "string", default: "http://127.0.0.1:18080" },
    questions: { type: "string" },
    "out-dir": { type: "string" },
    "recorder-log": { type: "string" },
  },
});

async function askApp(
  turns: ChatTurn[],
  sessionConfig?: Record<string, string>,
) {
  // The signal stays live while the body is read, so it bounds the stream too.
  // The session overrides go under `config`, the key the chat UI sends:
  // pages/api/chat.ts resolves the runtime from it alone and ignores any
  // other key, so a misnamed one silently answers with the default preset.
  const response = await fetch(`${values.app}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      sessionConfig
        ? { messages: turns, config: sessionConfig }
        : { messages: turns },
    ),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} ${await response.text()}`.trim());
  }
  return readChatResponseBody(response);
}

async function recordLocalPass(
  questions: Question[],
  outDir: string,
  recorderLog: string,
) {
  for (const question of questions) {
    const labelResponse = await fetch(`${values.recorder}/__label`, {
      method: "POST",
      body: JSON.stringify({ label: question.id }),
    });
    if (!labelResponse.ok) {
      throw new Error(
        `${question.id}: the recorder rejected the label (HTTP ${labelResponse.status})`,
      );
    }
    const result = await askApp(question.turns, { llmModel: LOCAL_MODEL_ID });
    if (!result.answerText.includes(STUB_ANSWER)) {
      throw new Error(
        `${question.id}: the answer did not come from the recorder, so the app substituted another model`,
      );
    }
    console.log(`[record] ${question.id} recorded`);
  }
  const recorded = await readJsonl(recorderLog);
  const fixture = buildFixture(
    questions,
    recorded as Parameters<typeof buildFixture>[1],
  );
  await writeFile(
    join(outDir, "fixture.json"),
    JSON.stringify(fixture, null, 2),
  );
  console.log(`[record] wrote ${fixture.items.length} items to fixture.json`);
}

async function recordReferencePass(questions: Question[], outDir: string) {
  const path = join(outDir, "reference-results.jsonl");
  await writeFile(path, "");
  for (const question of questions) {
    const identity = {
      variant: REFERENCE_VARIANT,
      key: REFERENCE_VARIANT,
      pass: "baseline",
      itemId: question.id,
      rep: 1,
      source: "app",
    };
    try {
      const result = await askApp(question.turns);
      if (result.answerText.trim() === "") {
        throw new Error("empty answer");
      }
      await appendFile(
        path,
        `${JSON.stringify({ ...identity, ok: true, text: result.answerText })}\n`,
      );
      console.log(`[reference] ${question.id} ok`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await appendFile(
        path,
        `${JSON.stringify({ ...identity, ok: false, error: message })}\n`,
      );
      console.error(`[reference] ${question.id} failed: ${message}`);
    }
  }
}

async function main() {
  if (!values.questions || !values["out-dir"]) {
    throw new Error("--questions and --out-dir are required");
  }
  const outDir = values["out-dir"];
  assertOutsideRepo(outDir, repoRoot);
  const { questions } = JSON.parse(
    await readFile(values.questions, "utf8"),
  ) as {
    questions: Question[];
  };
  if (values.pass === "local") {
    if (!values["recorder-log"]) {
      throw new Error("--recorder-log is required for --pass local");
    }
    assertOutsideRepo(values["recorder-log"], repoRoot);
    await recordLocalPass(questions, outDir, values["recorder-log"]);
  } else if (values.pass === "reference") {
    await recordReferencePass(questions, outDir);
  } else {
    throw new Error('--pass must be "local" or "reference"');
  }
}

try {
  await main();
} catch (err: unknown) {
  console.error(err);
  process.exitCode = 1;
}
