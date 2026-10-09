# Studio Local LLM Bake-off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run the Phase A1/A2 bake-off: record frozen JackGPT inputs, measure six model variants overnight on the model host, score them with an LLM judge, and produce a gate verdict.

**Architecture:** Two halves joined by files. The **host half** is dependency-free Node ESM (`.mjs`) copied to the model host: it switches models through LM Studio's REST API, streams every fixture item through the OpenAI-compatible endpoint, and writes resumable JSONL. The **laptop half** is TypeScript run with `tsx` from the repo: it records fixtures from the dev app through a stub endpoint, captures the production model's answers, judges every answer with Claude, and renders the report. No app code changes.

**Tech Stack:** Node 22 (host) / Node 20+ (laptop), `node:test` + `tsx`, LM Studio REST API v1 and OpenAI-compatible `/v1`, `@anthropic-ai/sdk` (new devDependency, already in the lockfile transitively).

**Spec:** [docs/superpowers/specs/2026-09-26-studio-local-llm-design.md](../specs/2026-09-26-studio-local-llm-design.md)

## Global Constraints

- **No app code changes.** Everything lives under `scripts/local-llm-bakeoff/` and `test/`.
- **Real visitor questions never enter the repository.** Questions, fixtures, results, scores and reports live in `$BAKEOFF_DATA_DIR`, a private directory outside the repo; laptop scripts refuse an output path inside the repo.
- **Repo text is English.** Korean appears only as test/sample data.
- **No machine-specific paths in committed files** (`pnpm lint:path-leaks`). Commands use `$BAKEOFF_HOST` (ssh alias of the model host), `$BAKEOFF_HOST_DIR` (working directory on the host), `$BAKEOFF_NODE` (absolute path of the host's Node 22 binary; non-interactive ssh may not have `node` on `PATH`) and `$BAKEOFF_DATA_DIR`.
- **Host scripts are plain ESM JavaScript with JSDoc types** and import only `node:` built-ins — the host has no repo checkout and no `node_modules`.
- **Laptop scripts are strict TypeScript, no `any`.**
- **Before each commit:** `pnpm exec eslint <changed files>`, `pnpm exec prettier --check <changed files>`, and the task's tests. (`eslint .` is known-broken on main; lint changed files only.)
- **Test command** for one file: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test <file>`.
- **Gate thresholds (from the spec):** TTFT p50 ≤ 1.5 s, p95 ≤ 3 s; decode p50 ≥ 40 tokens/s; zero confirmed ungrounded claims; refusal correctness ≥ 90%; mean judge score ≥ 90% of the gpt-6-luna mean; project-format compliance ≥ 90%. Language match, concurrency and memory are reported, not gating.
- **Any action on the shared host that loads or unloads a model happens only inside a window confirmed with the other consumer's owner.** Model downloads and judge spend need explicit approval first.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| File                                              | Side   | Responsibility                                                                              |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `scripts/local-llm-bakeoff/stream-metrics.mjs`    | host   | Parse an OpenAI SSE stream; compute TTFT, decode rate, reasoning size, visible text         |
| `scripts/local-llm-bakeoff/lmstudio-admin.mjs`    | host   | LM Studio REST v1 client: list, load, unload, snapshot/restore, download                    |
| `scripts/local-llm-bakeoff/results-store.mjs`     | both   | Append-only resumable JSONL store; `readJsonl`                                              |
| `scripts/local-llm-bakeoff/host-memory.mjs`       | host   | `vm_stat` parser for approximate used memory                                                |
| `scripts/local-llm-bakeoff/run-bakeoff.mjs`       | host   | CLI + `runBakeoff`: thinking-control probe, warmup, baseline, concurrency, memory, restore  |
| `scripts/local-llm-bakeoff/recorder.mjs`          | laptop | Stub OpenAI-compatible endpoint that logs every request the app sends                       |
| `scripts/local-llm-bakeoff/fixture.mjs`           | laptop | Pick each question's answer request out of the recorder log                                 |
| `scripts/local-llm-bakeoff/private-path.mjs`      | laptop | Refuse output paths inside the repo                                                         |
| `scripts/local-llm-bakeoff/record-fixture.ts`     | laptop | Drive the dev app: record fixture (local pass), capture gpt-6-luna answers (reference pass) |
| `scripts/local-llm-bakeoff/judge.ts`              | laptop | Judge rubric, JSON schema, prompt builder, verdict parser                                   |
| `scripts/local-llm-bakeoff/score.ts`              | laptop | CLI: cost estimate, then judge every answer with Claude                                     |
| `scripts/local-llm-bakeoff/summarize.ts`          | laptop | Aggregate results + scores + reviews into per-variant stats and gate verdicts               |
| `scripts/local-llm-bakeoff/report.ts`             | laptop | CLI: write the markdown report                                                              |
| `scripts/local-llm-bakeoff/manifest.json`         | both   | Candidate variants, load config, thinking-control candidates                                |
| `scripts/local-llm-bakeoff/sample-questions.json` | laptop | Five hand-written questions for dry runs                                                    |
| `scripts/local-llm-bakeoff/README.md`             | —      | Runbook                                                                                     |

## Data Flow

```
questions.json (private) ─► record-fixture --pass local ─► recorder log ─► fixture.json
                          └► record-fixture --pass reference ─► reference-results.jsonl
fixture.json + manifest.json ─► (host) run-bakeoff ─► results.jsonl, state.json, run.log
results.jsonl + reference-results.jsonl + fixture.json ─► score ─► scores.jsonl
results + scores + reviews.json ─► report ─► report.md (gate verdict per variant)
```

---

### Task 1: Stream metrics

**Files:**

- Create: `scripts/local-llm-bakeoff/stream-metrics.mjs`
- Test: `test/local-llm-bakeoff-stream-metrics.test.ts`

**Interfaces:**

- Produces: `readSseData(body: AsyncIterable<Uint8Array>): AsyncGenerator<string>`; `splitInlineThinking(raw: string): { visible: string; thinking: string; inline: boolean }`; `measureChatStream(body, startedAtMs: number, now?: () => number): Promise<StreamMetrics>` where `StreamMetrics = { firstTokenMs: number | null; ttftMs: number | null; totalMs: number; completionTokens: number; completionTokensSource: "usage" | "deltas"; decodeTokensPerSecond: number | null; reasoningChars: number; inlineThinking: boolean; text: string; finishReason: string | null }`.

TTFT is the first _visible_ answer character. Reasoning — whether sent as `delta.reasoning_content` / `delta.reasoning` or inline as a leading `<think>…</think>` block — counts against TTFT, because a visitor sees nothing while it streams.

- [ ] **Step 1: Write the failing test**

```ts
// test/local-llm-bakeoff-stream-metrics.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  measureChatStream,
  splitInlineThinking,
} from "@/scripts/local-llm-bakeoff/stream-metrics.mjs";

function sseBody(text: string, splitEvery = 7): AsyncIterable<Uint8Array> {
  const encoder = new TextEncoder();
  return (async function* () {
    for (let i = 0; i < text.length; i += splitEvery) {
      yield encoder.encode(text.slice(i, i + splitEvery));
    }
  })();
}

function sse(events: unknown[]): string {
  return (
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

function delta(fields: Record<string, string>, finish: string | null = null) {
  return { choices: [{ index: 0, delta: fields, finish_reason: finish }] };
}

// Each call advances 10 ms; measureChatStream calls it once per parsed event
// and once at the end.
function tickingClock(): () => number {
  let t = 0;
  return () => {
    t += 10;
    return t;
  };
}

void test("measures TTFT, decode rate and text from content split across chunks", async () => {
  const body = sseBody(
    sse([
      delta({ role: "assistant" }),
      delta({ content: "Hel" }),
      delta({ content: "lo" }),
      delta({}, "stop"),
      { choices: [], usage: { completion_tokens: 2 } },
    ]),
  );
  const metrics = await measureChatStream(body, 0, tickingClock());
  assert.equal(metrics.text, "Hello");
  assert.equal(metrics.firstTokenMs, 20);
  assert.equal(metrics.ttftMs, 20);
  assert.equal(metrics.completionTokens, 2);
  assert.equal(metrics.completionTokensSource, "usage");
  assert.equal(metrics.decodeTokensPerSecond, 100);
  assert.equal(metrics.finishReason, "stop");
  assert.equal(metrics.totalMs, 60);
  assert.equal(metrics.inlineThinking, false);
});

void test("separated reasoning delays TTFT and falls back to delta counting", async () => {
  const body = sseBody(
    sse([
      delta({ reasoning_content: "hmm" }),
      delta({ reasoning_content: " ok" }),
      delta({ content: "Hi" }),
    ]),
  );
  const metrics = await measureChatStream(body, 0, tickingClock());
  assert.equal(metrics.firstTokenMs, 10);
  assert.equal(metrics.ttftMs, 30);
  assert.equal(metrics.reasoningChars, 6);
  assert.equal(metrics.completionTokens, 3);
  assert.equal(metrics.completionTokensSource, "deltas");
  assert.equal(metrics.decodeTokensPerSecond, 100);
  assert.equal(metrics.text, "Hi");
});

void test("inline <think> blocks are reasoning, not visible text", async () => {
  const body = sseBody(
    sse([
      delta({ content: "<thi" }),
      delta({ content: "nk>plan</think>" }),
      delta({ content: "\nAnswer" }),
    ]),
  );
  const metrics = await measureChatStream(body, 0, tickingClock());
  assert.equal(metrics.firstTokenMs, 10);
  assert.equal(metrics.ttftMs, 30);
  assert.equal(metrics.text, "Answer");
  assert.equal(metrics.inlineThinking, true);
  assert.equal(metrics.reasoningChars, 4);
});

void test("a partial opening tag is not yet visible text", () => {
  assert.deepEqual(splitInlineThinking("<thi"), {
    visible: "",
    thinking: "",
    inline: true,
  });
  assert.deepEqual(splitInlineThinking("Plain"), {
    visible: "Plain",
    thinking: "",
    inline: false,
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/local-llm-bakeoff-stream-metrics.test.ts`
Expected: FAIL — cannot find module `stream-metrics.mjs`.

- [ ] **Step 3: Write the implementation**

```js
// scripts/local-llm-bakeoff/stream-metrics.mjs

/**
 * Per-request timing for an OpenAI-compatible streaming chat completion.
 *
 * @typedef {Object} StreamMetrics
 * @property {number | null} firstTokenMs First generated token of any kind, reasoning included.
 * @property {number | null} ttftMs First visible answer character; reasoning never counts.
 * @property {number} totalMs
 * @property {number} completionTokens
 * @property {"usage" | "deltas"} completionTokensSource
 * @property {number | null} decodeTokensPerSecond
 * @property {number} reasoningChars
 * @property {boolean} inlineThinking
 * @property {string} text
 * @property {string | null} finishReason
 */

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

/**
 * Yields the payload of every `data:` line in an SSE byte stream.
 * @param {AsyncIterable<Uint8Array>} body
 * @returns {AsyncGenerator<string>}
 */
export async function* readSseData(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (line.startsWith("data:")) {
        yield line.slice(5).trim();
      }
      newline = buffer.indexOf("\n");
    }
  }
  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    yield tail.slice(5).trim();
  }
}

/**
 * Splits streamed content into the visible answer and any `<think>` section
 * a model emitted in-band instead of as a separate reasoning field.
 * @param {string} raw
 * @returns {{ visible: string; thinking: string; inline: boolean }}
 */
export function splitInlineThinking(raw) {
  const trimmed = raw.trimStart();
  // "<thi" may still become "<think>", so it is not visible yet.
  if (trimmed.length < THINK_OPEN.length && THINK_OPEN.startsWith(trimmed)) {
    return { visible: "", thinking: "", inline: trimmed.length > 0 };
  }
  if (!trimmed.startsWith(THINK_OPEN)) {
    return { visible: raw, thinking: "", inline: false };
  }
  const close = trimmed.indexOf(THINK_CLOSE);
  if (close === -1) {
    return {
      visible: "",
      thinking: trimmed.slice(THINK_OPEN.length),
      inline: true,
    };
  }
  return {
    visible: trimmed.slice(close + THINK_CLOSE.length).trimStart(),
    thinking: trimmed.slice(THINK_OPEN.length, close),
    inline: true,
  };
}

/**
 * @param {AsyncIterable<Uint8Array>} body
 * @param {number} startedAtMs
 * @param {() => number} [now]
 * @returns {Promise<StreamMetrics>}
 */
export async function measureChatStream(
  body,
  startedAtMs,
  now = () => performance.now(),
) {
  /** @type {number | null} */
  let firstTokenMs = null;
  /** @type {number | null} */
  let ttftMs = null;
  /** @type {number | null} */
  let lastTokenMs = null;
  /** @type {number | null} */
  let usageTokens = null;
  /** @type {string | null} */
  let finishReason = null;
  let raw = "";
  let reasoning = "";
  let deltaCount = 0;

  for await (const data of readSseData(body)) {
    if (data === "[DONE]") {
      break;
    }
    const event = JSON.parse(data);
    const at = now() - startedAtMs;
    if (typeof event.usage?.completion_tokens === "number") {
      usageTokens = event.usage.completion_tokens;
    }
    const choice = event.choices?.[0];
    if (!choice) {
      continue;
    }
    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
    }
    const reasoningPiece =
      choice.delta?.reasoning_content ?? choice.delta?.reasoning ?? "";
    const contentPiece = choice.delta?.content ?? "";
    if (!reasoningPiece && !contentPiece) {
      continue;
    }
    deltaCount += 1;
    firstTokenMs ??= at;
    lastTokenMs = at;
    reasoning += reasoningPiece;
    raw += contentPiece;
    if (ttftMs === null && splitInlineThinking(raw).visible.length > 0) {
      ttftMs = at;
    }
  }

  const totalMs = now() - startedAtMs;
  const split = splitInlineThinking(raw);
  // Usage counts every generated token, reasoning included, which is what the
  // decode rate should measure. Servers that omit usage get one token per delta.
  const completionTokens = usageTokens ?? deltaCount;
  const spanMs =
    firstTokenMs !== null && lastTokenMs !== null
      ? lastTokenMs - firstTokenMs
      : 0;
  return {
    firstTokenMs,
    ttftMs,
    totalMs,
    completionTokens,
    completionTokensSource: usageTokens === null ? "deltas" : "usage",
    decodeTokensPerSecond:
      spanMs > 0 && completionTokens > 1
        ? (completionTokens - 1) / (spanMs / 1000)
        : null,
    reasoningChars: reasoning.length + split.thinking.length,
    inlineThinking: split.inline,
    text: split.visible,
    finishReason,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: the Step 2 command. Expected: 4 tests PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
pnpm exec eslint scripts/local-llm-bakeoff/stream-metrics.mjs test/local-llm-bakeoff-stream-metrics.test.ts
pnpm exec prettier --check scripts/local-llm-bakeoff/stream-metrics.mjs test/local-llm-bakeoff-stream-metrics.test.ts
git add scripts/local-llm-bakeoff/stream-metrics.mjs test/local-llm-bakeoff-stream-metrics.test.ts
git commit -m "feat(bakeoff): stream metrics for OpenAI-compatible chat streams

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: LM Studio admin client

**Files:**

- Create: `scripts/local-llm-bakeoff/lmstudio-admin.mjs`
- Test: `test/local-llm-bakeoff-lmstudio-admin.test.ts`

**Interfaces:**

- Produces: `createLmStudioAdmin({ baseUrl: string; apiToken?: string; fetchImpl?: typeof fetch })` returning `{ listModels(): Promise<LmStudioModel[]>; loadedLlmInstances(): Promise<LoadedInstance[]>; load(modelKey: string, loadConfig?: Record<string, unknown>): Promise<unknown>; unload(instanceId: string): Promise<unknown>; unloadAllLlms(): Promise<void>; restore(snapshot: LoadedInstance[]): Promise<void>; download(modelRef: string): Promise<unknown> }` where `LoadedInstance = { modelKey: string; instanceId: string; contextLength: number | null }`.

Endpoint shapes were confirmed against the host on 2026-09-26: `GET /api/v1/models` returns `{ models: [{ key, type, loaded_instances: [{ id, config: { context_length } }] }] }`; `POST /api/v1/models/load` takes `{ model, context_length?, echo_load_config? }`; `POST /api/v1/models/unload` takes `{ instance_id }`; `POST /api/v1/models/download` takes `{ model }`.

- [ ] **Step 1: Write the failing test**

```ts
// test/local-llm-bakeoff-lmstudio-admin.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import { createLmStudioAdmin } from "@/scripts/local-llm-bakeoff/lmstudio-admin.mjs";

type Call = {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
};

function fakeLmStudio(initial: Record<string, number | null>) {
  const loaded = new Map<string, number | null>(Object.entries(initial));
  const calls: Call[] = [];
  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(String(input));
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;
    calls.push({ method: init?.method ?? "GET", path: url.pathname, body });
    if (url.pathname === "/api/v1/models") {
      return Response.json({
        models: ["model-a", "model-b", "embed"].map((key) => ({
          key,
          type: key === "embed" ? "embeddings" : "llm",
          loaded_instances: loaded.has(key)
            ? [{ id: key, config: { context_length: loaded.get(key) } }]
            : [],
        })),
      });
    }
    if (url.pathname === "/api/v1/models/load") {
      const contextLength = body?.context_length;
      loaded.set(
        String(body?.model),
        typeof contextLength === "number" ? contextLength : null,
      );
      return Response.json({ instance_id: body?.model, status: "loaded" });
    }
    if (url.pathname === "/api/v1/models/unload") {
      loaded.delete(String(body?.instance_id));
      return Response.json({ instance_id: body?.instance_id });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetchImpl, calls, loaded };
}

void test("lists loaded LLM instances with their context length, skipping embeddings", async () => {
  const fake = fakeLmStudio({ "model-a": 16384, embed: null });
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: fake.fetchImpl,
  });
  assert.deepEqual(await admin.loadedLlmInstances(), [
    { modelKey: "model-a", instanceId: "model-a", contextLength: 16384 },
  ]);
});

void test("restore unloads what is loaded and reloads the snapshot with its context length", async () => {
  const fake = fakeLmStudio({ "model-a": 16384 });
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: fake.fetchImpl,
  });
  const snapshot = await admin.loadedLlmInstances();
  await admin.unloadAllLlms();
  await admin.load("model-b", { context_length: 8192 });
  await admin.restore(snapshot);
  assert.deepEqual([...fake.loaded.entries()], [["model-a", 16384]]);
  assert.deepEqual(fake.calls.at(-1)?.body, {
    model: "model-a",
    context_length: 16384,
    echo_load_config: true,
  });
});

void test("a non-2xx response throws with status and body", async () => {
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: async () => new Response("boom", { status: 500 }),
  });
  await assert.rejects(admin.load("x"), /HTTP 500 boom/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/local-llm-bakeoff-lmstudio-admin.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```js
// scripts/local-llm-bakeoff/lmstudio-admin.mjs

/**
 * @typedef {{ modelKey: string; instanceId: string; contextLength: number | null }} LoadedInstance
 * @typedef {{ key: string; type: string; loaded_instances: { id: string; config?: { context_length?: number | null } }[] }} LmStudioModel
 */

/**
 * Client for LM Studio's native REST API (`/api/v1`). Model switching goes
 * through here; chat traffic uses the OpenAI-compatible `/v1` routes.
 * @param {{ baseUrl: string; apiToken?: string; fetchImpl?: typeof fetch }} options
 */
export function createLmStudioAdmin({ baseUrl, apiToken, fetchImpl = fetch }) {
  /**
   * @param {"GET" | "POST"} method
   * @param {string} path
   * @param {Record<string, unknown>} [body]
   */
  async function call(method, path, body) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `LM Studio ${method} ${path} failed: HTTP ${response.status} ${text}`.trim(),
      );
    }
    return text ? JSON.parse(text) : {};
  }

  /** @returns {Promise<LmStudioModel[]>} */
  async function listModels() {
    const payload = await call("GET", "/api/v1/models");
    return payload.models;
  }

  /** @returns {Promise<LoadedInstance[]>} */
  async function loadedLlmInstances() {
    const models = await listModels();
    return models
      .filter((model) => model.type === "llm")
      .flatMap((model) =>
        model.loaded_instances.map((instance) => ({
          modelKey: model.key,
          instanceId: instance.id,
          contextLength: instance.config?.context_length ?? null,
        })),
      );
  }

  /**
   * @param {string} modelKey
   * @param {Record<string, unknown>} [loadConfig]
   */
  async function load(modelKey, loadConfig = {}) {
    return call("POST", "/api/v1/models/load", {
      model: modelKey,
      ...loadConfig,
      echo_load_config: true,
    });
  }

  /** @param {string} instanceId */
  async function unload(instanceId) {
    return call("POST", "/api/v1/models/unload", { instance_id: instanceId });
  }

  async function unloadAllLlms() {
    for (const instance of await loadedLlmInstances()) {
      await unload(instance.instanceId);
    }
  }

  /**
   * Returns the server to a snapshot taken with `loadedLlmInstances`.
   * @param {LoadedInstance[]} snapshot
   */
  async function restore(snapshot) {
    await unloadAllLlms();
    for (const instance of snapshot) {
      await load(
        instance.modelKey,
        instance.contextLength === null
          ? {}
          : { context_length: instance.contextLength },
      );
    }
  }

  /** @param {string} modelRef LM Studio catalog id or Hugging Face URL */
  async function download(modelRef) {
    return call("POST", "/api/v1/models/download", { model: modelRef });
  }

  return {
    listModels,
    loadedLlmInstances,
    load,
    unload,
    unloadAllLlms,
    restore,
    download,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: the Step 2 command. Expected: 3 tests PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
pnpm exec eslint scripts/local-llm-bakeoff/lmstudio-admin.mjs test/local-llm-bakeoff-lmstudio-admin.test.ts
pnpm exec prettier --check scripts/local-llm-bakeoff/lmstudio-admin.mjs test/local-llm-bakeoff-lmstudio-admin.test.ts
git add scripts/local-llm-bakeoff/lmstudio-admin.mjs test/local-llm-bakeoff-lmstudio-admin.test.ts
git commit -m "feat(bakeoff): LM Studio REST client with snapshot and restore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Results store and host memory reading

**Files:**

- Create: `scripts/local-llm-bakeoff/results-store.mjs`, `scripts/local-llm-bakeoff/host-memory.mjs`
- Test: `test/local-llm-bakeoff-store-memory.test.ts`

**Interfaces:**

- Produces: `rowKey(row: RowIdentity): string`; `openResultsStore(path: string): Promise<{ has(row: RowIdentity): boolean; append(row: RowIdentity & Record<string, unknown>): Promise<void> }>`; `readJsonl(path: string): Promise<Record<string, unknown>[]>` where `RowIdentity = { variant: string; pass: string; itemId: string; rep: number }`. `parseVmStatUsedBytes(text: string): number`; `readUsedMemoryBytes(): Promise<number>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/local-llm-bakeoff-store-memory.test.ts
import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseVmStatUsedBytes } from "@/scripts/local-llm-bakeoff/host-memory.mjs";
import {
  openResultsStore,
  readJsonl,
} from "@/scripts/local-llm-bakeoff/results-store.mjs";

const row = { variant: "v1", pass: "baseline", itemId: "q1", rep: 1 };

void test("a reopened store remembers rows already written", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-store-"));
  try {
    const path = join(dir, "results.jsonl");
    const first = await openResultsStore(path);
    assert.equal(first.has(row), false);
    await first.append({ ...row, ok: true });
    const reopened = await openResultsStore(path);
    assert.equal(reopened.has(row), true);
    assert.equal(reopened.has({ ...row, rep: 2 }), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

void test("a partial last line from a crash is ignored and not glued to the next row", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-store-"));
  try {
    const path = join(dir, "results.jsonl");
    await appendFile(
      path,
      `${JSON.stringify({ ...row, ok: true })}\n{"variant":"v1","pa`,
    );
    const store = await openResultsStore(path);
    await store.append({ ...row, rep: 2, ok: true });
    const rows = await readJsonl(path);
    assert.deepEqual(
      rows.map((r) => r.rep),
      [1, 2],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

void test("vm_stat used memory is wired + active + compressor pages", () => {
  const text = [
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
    "Pages free:                               100000.",
    "Pages active:                             200000.",
    "Pages inactive:                           150000.",
    "Pages wired down:                         300000.",
    "Pages stored in compressor:                80000.",
    "Pages occupied by compressor:              40000.",
  ].join("\n");
  assert.equal(parseVmStatUsedBytes(text), 540000 * 16384);
  assert.throws(() => parseVmStatUsedBytes("garbage"), /page size/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/local-llm-bakeoff-store-memory.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```js
// scripts/local-llm-bakeoff/results-store.mjs
import { appendFile, readFile } from "node:fs/promises";

/**
 * @typedef {{ variant: string; pass: string; itemId: string; rep: number }} RowIdentity
 */

/** @param {RowIdentity} row */
export function rowKey(row) {
  return [row.variant, row.pass, row.itemId, String(row.rep)].join("|");
}

/** @param {string} path */
async function readIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

/**
 * Append-only JSONL store. Reopening it skips rows already written, which is
 * what makes an interrupted overnight run resumable.
 * @param {string} path
 */
export async function openResultsStore(path) {
  const existing = await readIfExists(path);
  /** @type {Set<string>} */
  const keys = new Set();
  for (const line of existing.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      keys.add(rowKey(JSON.parse(line)));
    } catch {
      // A crash can leave a partial final line; that row is simply redone.
    }
  }
  if (existing.length > 0 && !existing.endsWith("\n")) {
    await appendFile(path, "\n");
  }
  return {
    /** @param {RowIdentity} row */
    has: (row) => keys.has(rowKey(row)),
    /** @param {RowIdentity & Record<string, unknown>} row */
    async append(row) {
      await appendFile(path, `${JSON.stringify(row)}\n`);
      keys.add(rowKey(row));
    },
  };
}

/**
 * @param {string} path
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}
```

```js
// scripts/local-llm-bakeoff/host-memory.mjs
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Approximate used unified memory: wired + active + compressor pages. An MLX
 * model's GPU buffers land in wired memory, so the delta across a model load
 * approximates its resident footprint. It is system-wide, so other processes
 * add noise; the report labels it approximate.
 * @param {string} text output of `vm_stat`
 * @returns {number} bytes
 */
export function parseVmStatUsedBytes(text) {
  const pageSize = Number(/page size of (\d+) bytes/.exec(text)?.[1]);
  if (!Number.isFinite(pageSize)) {
    throw new Error("vm_stat output has no page size");
  }
  /** @param {string} label */
  const pages = (label) => {
    const match = new RegExp(`${label}:\\s+(\\d+)\\.`).exec(text);
    if (!match) {
      throw new Error(`vm_stat output has no "${label}" line`);
    }
    return Number(match[1]);
  };
  return (
    (pages("Pages wired down") +
      pages("Pages active") +
      pages("Pages occupied by compressor")) *
    pageSize
  );
}

export async function readUsedMemoryBytes() {
  const { stdout } = await execFileAsync("vm_stat");
  return parseVmStatUsedBytes(stdout);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: the Step 2 command. Expected: 3 tests PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
pnpm exec eslint scripts/local-llm-bakeoff/results-store.mjs scripts/local-llm-bakeoff/host-memory.mjs test/local-llm-bakeoff-store-memory.test.ts
pnpm exec prettier --check scripts/local-llm-bakeoff/results-store.mjs scripts/local-llm-bakeoff/host-memory.mjs test/local-llm-bakeoff-store-memory.test.ts
git add scripts/local-llm-bakeoff/results-store.mjs scripts/local-llm-bakeoff/host-memory.mjs test/local-llm-bakeoff-store-memory.test.ts
git commit -m "feat(bakeoff): resumable JSONL store and vm_stat memory reading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Bake-off runner

**Files:**

- Create: `scripts/local-llm-bakeoff/run-bakeoff.mjs`
- Test: `test/local-llm-bakeoff-runner.test.ts`

**Interfaces:**

- Consumes: `measureChatStream` (Task 1), `createLmStudioAdmin` (Task 2), `openResultsStore`, `readJsonl`, `readUsedMemoryBytes` (Task 3).
- Produces: `runBakeoff(options: RunOptions): Promise<void>`; `preflight(options): Promise<{ missing: string[]; available: string[] }>`; `msUntil(hhmm: string, from: Date): number`; `BACKGROUND_PROMPT: string`. Types: `Variant = { id: string; key: string; role: string; downloadRef: string | null; loadConfig: Record<string, unknown>; requestExtras: Record<string, unknown>; thinkingCandidates?: Record<string, unknown>[] }`; `FixtureItem = { id: string; lang: string; kind: string; messages: { role: "system" | "user" | "assistant"; content: string }[]; temperature: number | null; maxTokens: number | null }`.
- Result rows (JSONL): `pass` is `"probe"` (thinking-control candidates, `rep` = candidate index), `"baseline"` (reps 1..N), `"concurrent"` (rep 1, with two background long generations running), `"memory"` (`itemId: "-"`, `rep: 0`, with `idleBytes`, `peakBytes`, `deltaBytes`). Measured rows carry every `StreamMetrics` field plus `key`, `startedAt`, `ok`, and `extras`; failed rows carry `ok: false` and `error`.

Per variant: skip if every row already exists; otherwise unload all LLMs, read idle memory, load the variant, probe each thinking candidate once and keep the one with the fewest reasoning characters, warm up twice, run the baseline and concurrency passes, write the memory row, unload. A variant that fails is logged and skipped; the snapshot is restored in `finally` whatever happens, and on SIGINT/SIGTERM.

- [ ] **Step 1: Write the failing test**

```ts
// test/local-llm-bakeoff-runner.test.ts
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readJsonl } from "@/scripts/local-llm-bakeoff/results-store.mjs";
import {
  BACKGROUND_PROMPT,
  msUntil,
  runBakeoff,
} from "@/scripts/local-llm-bakeoff/run-bakeoff.mjs";

function sendJson(res: ServerResponse, payload: unknown) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function startFakeLmStudio(failContent?: string) {
  const loaded = new Map<string, number | null>([["model-a", 16384]]);
  const chatCalls: { model: string; content: string; extras: unknown }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = chunks.length
      ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
          string,
          unknown
        >)
      : {};
    if (req.url === "/api/v1/models") {
      return sendJson(res, {
        models: ["model-a", "model-b"].map((key) => ({
          key,
          type: "llm",
          loaded_instances: loaded.has(key)
            ? [{ id: key, config: { context_length: loaded.get(key) } }]
            : [],
        })),
      });
    }
    if (req.url === "/api/v1/models/load") {
      loaded.set(
        String(body.model),
        typeof body.context_length === "number" ? body.context_length : null,
      );
      return sendJson(res, { instance_id: body.model, status: "loaded" });
    }
    if (req.url === "/api/v1/models/unload") {
      loaded.delete(String(body.instance_id));
      return sendJson(res, { instance_id: body.instance_id });
    }
    if (req.url === "/v1/chat/completions") {
      const messages = body.messages as { content: string }[];
      const content = messages.at(-1)?.content ?? "";
      chatCalls.push({
        model: String(body.model),
        content,
        extras: body.chat_template_kwargs ?? null,
      });
      if (content === failContent) {
        res.writeHead(500);
        return res.end("boom");
      }
      // The "thinking on" candidate (no kwargs) streams reasoning first.
      const thinking = body.chat_template_kwargs === undefined;
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const pieces = thinking
        ? [
            { reasoning_content: "long thought" },
            { content: "Hi" },
            { content: " there" },
          ]
        : [{ content: "Hi" }, { content: " there" }];
      for (const piece of pieces) {
        res.write(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: piece, finish_reason: null }] })}\n\n`,
        );
      }
      res.write(
        `data: ${JSON.stringify({ choices: [], usage: { completion_tokens: 2 } })}\n\n`,
      );
      return res.end("data: [DONE]\n\n");
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("fake server has no port");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    loaded,
    chatCalls,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const variants = [
  {
    id: "b-4bit",
    key: "model-b",
    role: "speed",
    downloadRef: null,
    loadConfig: { context_length: 8192 },
    requestExtras: {},
    thinkingCandidates: [
      {},
      { chat_template_kwargs: { enable_thinking: false } },
    ],
  },
];

function item(id: string, content: string) {
  return {
    id,
    lang: "en",
    kind: "project",
    messages: [{ role: "user" as const, content }],
    temperature: 0.2,
    maxTokens: 64,
  };
}

const items = [item("q1", "first question"), item("q2", "second question")];

void test("probes, measures both passes, records memory and restores the snapshot", async () => {
  const fake = await startFakeLmStudio();
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  try {
    await runBakeoff({
      baseUrl: fake.baseUrl,
      variants,
      items,
      resultsPath: join(dir, "results.jsonl"),
      statePath: join(dir, "state.json"),
      reps: 2,
      readMemory: async () => 1_000,
      log: () => {},
    });
    const rows = await readJsonl(join(dir, "results.jsonl"));
    const baseline = rows.filter((r) => r.pass === "baseline");
    assert.equal(baseline.length, 4);
    assert.ok(baseline.every((r) => r.ok === true && r.text === "Hi there"));
    // The candidate that disables thinking wins and is used for measurement.
    assert.ok(baseline.every((r) => r.reasoningChars === 0));
    assert.equal(rows.filter((r) => r.pass === "probe").length, 2);
    assert.equal(rows.filter((r) => r.pass === "concurrent").length, 2);
    assert.equal(rows.filter((r) => r.pass === "memory").length, 1);
    assert.ok(fake.chatCalls.some((c) => c.content === BACKGROUND_PROMPT));
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16384]]);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("records a failed item, keeps going, and a rerun repeats nothing", async () => {
  const fake = await startFakeLmStudio("second question");
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  const options = {
    baseUrl: fake.baseUrl,
    variants,
    items,
    resultsPath: join(dir, "results.jsonl"),
    statePath: join(dir, "state.json"),
    reps: 1,
    readMemory: async () => 1_000,
    log: () => {},
  };
  const foreground = () =>
    fake.chatCalls.filter((c) => c.content !== BACKGROUND_PROMPT).length;
  try {
    await runBakeoff(options);
    const rows = await readJsonl(options.resultsPath);
    const failed = rows.find((r) => r.itemId === "q2" && r.pass === "baseline");
    assert.equal(failed?.ok, false);
    assert.match(String(failed?.error), /HTTP 500/);
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16384]]);
    const before = foreground();
    await runBakeoff(options);
    assert.equal(foreground(), before);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("msUntil waits for the next occurrence of a local wall-clock time", () => {
  const lateEvening = new Date(2026, 8, 26, 23, 0, 0);
  assert.equal(msUntil("01:30", lateEvening), 2.5 * 60 * 60 * 1000);
  assert.equal(msUntil("23:30", lateEvening), 30 * 60 * 1000);
  assert.throws(() => msUntil("1:30", lateEvening), /HH:MM/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/local-llm-bakeoff-runner.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```js
#!/usr/bin/env node
// scripts/local-llm-bakeoff/run-bakeoff.mjs
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { readUsedMemoryBytes } from "./host-memory.mjs";
import { createLmStudioAdmin } from "./lmstudio-admin.mjs";
import { openResultsStore } from "./results-store.mjs";
import { measureChatStream } from "./stream-metrics.mjs";

/**
 * @typedef {{ role: "system" | "user" | "assistant"; content: string }} ChatMessage
 * @typedef {{ id: string; lang: string; kind: string; messages: ChatMessage[]; temperature: number | null; maxTokens: number | null }} FixtureItem
 * @typedef {{ id: string; key: string; role: string; downloadRef: string | null; loadConfig: Record<string, unknown>; requestExtras: Record<string, unknown>; thinkingCandidates?: Record<string, unknown>[] }} Variant
 * @typedef {{ baseUrl: string; apiToken?: string; variants: Variant[]; items: FixtureItem[]; resultsPath: string; statePath: string; reps: number; fetchImpl?: typeof fetch; now?: () => number; readMemory?: () => Promise<number>; signal?: AbortSignal; log?: (line: string) => void }} RunOptions
 * @typedef {Awaited<ReturnType<typeof openResultsStore>>} ResultsStore
 */

const DEFAULT_MAX_TOKENS = 1024;
const WARMUP_REQUESTS = 2;
const BACKGROUND_STREAMS = 2;
const BACKGROUND_RETRY_MS = 250;
export const BACKGROUND_PROMPT =
  "Write a detailed 1,500-word essay on the history of cartography.";

/**
 * @param {Pick<RunOptions, "baseUrl" | "apiToken" | "fetchImpl" | "now">} options
 * @param {Variant} variant
 * @param {FixtureItem} item
 * @param {Record<string, unknown>} extras
 * @param {AbortSignal} [signal]
 */
async function streamCompletion(options, variant, item, extras, signal) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const response = await fetchImpl(`${options.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.apiToken
        ? { Authorization: `Bearer ${options.apiToken}` }
        : {}),
    },
    body: JSON.stringify({
      model: variant.key,
      messages: item.messages,
      ...(item.temperature === null ? {} : { temperature: item.temperature }),
      max_tokens: item.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
      ...extras,
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `chat completion failed: HTTP ${response.status} ${await response.text()}`.trim(),
    );
  }
  return measureChatStream(response.body, startedAt, now);
}

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {RunOptions} options
 * @param {ResultsStore} store
 * @param {Variant} variant
 */
function variantComplete(options, store, variant) {
  /** @type {{ variant: string; pass: string; itemId: string; rep: number }[]} */
  const rows = [{ variant: variant.id, pass: "memory", itemId: "-", rep: 0 }];
  for (let rep = 1; rep <= options.reps; rep += 1) {
    for (const item of options.items) {
      rows.push({
        variant: variant.id,
        pass: "baseline",
        itemId: item.id,
        rep,
      });
    }
  }
  for (const item of options.items) {
    rows.push({
      variant: variant.id,
      pass: "concurrent",
      itemId: item.id,
      rep: 1,
    });
  }
  return rows.every((row) => store.has(row));
}

/**
 * Tries each thinking-control candidate once and keeps the one that produced
 * the least reasoning. Some models (gpt-oss) cannot turn reasoning off, so
 * "least" rather than "zero" is the rule.
 * @param {RunOptions} options
 * @param {ResultsStore} store
 * @param {Variant} variant
 * @param {(line: string) => void} log
 * @returns {Promise<Record<string, unknown>>}
 */
async function chooseRequestExtras(options, store, variant, log) {
  const candidates = variant.thinkingCandidates ?? [];
  if (candidates.length === 0) {
    return variant.requestExtras ?? {};
  }
  const probeItem = options.items[0];
  /** @type {{ extras: Record<string, unknown>; reasoningChars: number } | null} */
  let best = null;
  for (const [index, extras] of candidates.entries()) {
    const identity = {
      variant: variant.id,
      pass: "probe",
      itemId: probeItem.id,
      rep: index,
    };
    try {
      const metrics = await streamCompletion(
        options,
        variant,
        probeItem,
        extras,
        options.signal,
      );
      if (!store.has(identity)) {
        await store.append({
          ...identity,
          key: variant.key,
          ok: true,
          extras,
          ...metrics,
        });
      }
      if (best === null || metrics.reasoningChars < best.reasoningChars) {
        best = { extras, reasoningChars: metrics.reasoningChars };
      }
    } catch (error) {
      if (!store.has(identity)) {
        await store.append({
          ...identity,
          key: variant.key,
          ok: false,
          extras,
          error: messageOf(error),
        });
      }
    }
  }
  if (best === null) {
    throw new Error(
      `every thinking-control candidate failed for ${variant.id}`,
    );
  }
  log(
    `[${variant.id}] request extras ${JSON.stringify(best.extras)} (reasoning chars ${best.reasoningChars})`,
  );
  return best.extras;
}

/**
 * @param {RunOptions} options
 * @param {ResultsStore} store
 * @param {Variant} variant
 * @param {FixtureItem} item
 * @param {Record<string, unknown>} extras
 * @param {"baseline" | "concurrent"} pass
 * @param {number} rep
 * @param {(line: string) => void} log
 */
async function measureOne(
  options,
  store,
  variant,
  item,
  extras,
  pass,
  rep,
  log,
) {
  const identity = { variant: variant.id, pass, itemId: item.id, rep };
  if (store.has(identity)) {
    return;
  }
  const startedAt = new Date().toISOString();
  try {
    const metrics = await streamCompletion(
      options,
      variant,
      item,
      extras,
      options.signal,
    );
    await store.append({
      ...identity,
      key: variant.key,
      startedAt,
      ok: true,
      extras,
      ...metrics,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      return; // left unwritten so a resumed run measures it
    }
    log(
      `[${variant.id}] ${pass} ${item.id} rep ${rep} failed: ${messageOf(error)}`,
    );
    await store.append({
      ...identity,
      key: variant.key,
      startedAt,
      ok: false,
      extras,
      error: messageOf(error),
    });
  }
}

/**
 * Keeps one long generation in flight until `stopSignal` fires, standing in
 * for a second consumer of the same server.
 * @param {RunOptions} options
 * @param {Variant} variant
 * @param {Record<string, unknown>} extras
 * @param {AbortSignal} stopSignal
 */
async function runBackground(options, variant, extras, stopSignal) {
  const signal = options.signal
    ? AbortSignal.any([stopSignal, options.signal])
    : stopSignal;
  /** @type {FixtureItem} */
  const item = {
    id: "background",
    lang: "en",
    kind: "background",
    messages: [{ role: "user", content: BACKGROUND_PROMPT }],
    temperature: null,
    maxTokens: 1500,
  };
  while (!signal.aborted) {
    try {
      await streamCompletion(options, variant, item, extras, signal);
    } catch {
      await delay(BACKGROUND_RETRY_MS, undefined, { signal }).catch(() => {});
    }
  }
}

/**
 * @param {RunOptions} options
 * @param {ReturnType<typeof createLmStudioAdmin>} admin
 * @param {ResultsStore} store
 * @param {Variant} variant
 * @param {() => Promise<number>} readMemory
 * @param {(line: string) => void} log
 */
async function runVariant(options, admin, store, variant, readMemory, log) {
  if (variantComplete(options, store, variant)) {
    log(`[${variant.id}] already complete, skipping`);
    return;
  }
  await admin.unloadAllLlms();
  const idleBytes = await readMemory();
  log(`[${variant.id}] loading ${variant.key}`);
  await admin.load(variant.key, variant.loadConfig ?? {});
  let peakBytes = await readMemory();
  const sampleMemory = async () => {
    peakBytes = Math.max(peakBytes, await readMemory());
  };

  const extras = await chooseRequestExtras(options, store, variant, log);
  for (let i = 0; i < WARMUP_REQUESTS; i += 1) {
    await streamCompletion(
      options,
      variant,
      options.items[0],
      extras,
      options.signal,
    ).catch((error) =>
      log(`[${variant.id}] warmup failed: ${messageOf(error)}`),
    );
  }

  for (let rep = 1; rep <= options.reps; rep += 1) {
    for (const item of options.items) {
      if (options.signal?.aborted) {
        return;
      }
      await measureOne(
        options,
        store,
        variant,
        item,
        extras,
        "baseline",
        rep,
        log,
      );
      await sampleMemory();
    }
  }

  const stop = new AbortController();
  const background = Array.from({ length: BACKGROUND_STREAMS }, () =>
    runBackground(options, variant, extras, stop.signal),
  );
  try {
    for (const item of options.items) {
      if (options.signal?.aborted) {
        return;
      }
      await measureOne(
        options,
        store,
        variant,
        item,
        extras,
        "concurrent",
        1,
        log,
      );
      await sampleMemory();
    }
  } finally {
    stop.abort();
    await Promise.all(background);
  }

  const memoryRow = {
    variant: variant.id,
    pass: "memory",
    itemId: "-",
    rep: 0,
  };
  if (!store.has(memoryRow)) {
    await store.append({
      ...memoryRow,
      key: variant.key,
      idleBytes,
      peakBytes,
      deltaBytes: peakBytes - idleBytes,
    });
  }
  await admin.unloadAllLlms();
  log(`[${variant.id}] done`);
}

/** @param {RunOptions} options */
export async function runBakeoff(options) {
  const log =
    options.log ??
    ((line) => console.log(`${new Date().toISOString()} ${line}`));
  const readMemory = options.readMemory ?? readUsedMemoryBytes;
  const admin = createLmStudioAdmin(options);
  const store = await openResultsStore(options.resultsPath);
  const snapshot = await admin.loadedLlmInstances();
  await writeFile(
    options.statePath,
    JSON.stringify({ takenAt: new Date().toISOString(), snapshot }, null, 2),
  );
  log(
    `snapshot: ${snapshot.map((s) => `${s.modelKey}@${s.contextLength}`).join(", ") || "(nothing loaded)"}`,
  );
  try {
    for (const variant of options.variants) {
      if (options.signal?.aborted) {
        break;
      }
      try {
        await runVariant(options, admin, store, variant, readMemory, log);
      } catch (error) {
        log(`[${variant.id}] aborted: ${messageOf(error)}`);
      }
    }
  } finally {
    log("restoring snapshot");
    await admin.restore(snapshot);
    log("restored");
  }
}

/** @param {Pick<RunOptions, "baseUrl" | "apiToken" | "fetchImpl" | "variants">} options */
export async function preflight(options) {
  const admin = createLmStudioAdmin(options);
  const keys = new Set((await admin.listModels()).map((model) => model.key));
  return {
    missing: options.variants.filter((v) => !keys.has(v.key)).map((v) => v.id),
    available: [...keys].sort(),
  };
}

/**
 * @param {string} hhmm local wall-clock time
 * @param {Date} from
 */
export function msUntil(hhmm, from) {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) {
    throw new Error(`--start-at expects HH:MM, got "${hhmm}"`);
  }
  const target = new Date(from);
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (target.getTime() <= from.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - from.getTime();
}

async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: "string", default: "run" },
      "base-url": { type: "string", default: "http://127.0.0.1:1234" },
      manifest: { type: "string" },
      fixture: { type: "string" },
      out: { type: "string", default: "results.jsonl" },
      state: { type: "string", default: "state.json" },
      reps: { type: "string", default: "3" },
      only: { type: "string" },
      "start-at": { type: "string" },
    },
  });
  if (!values.manifest) {
    throw new Error("--manifest is required");
  }
  const manifest = JSON.parse(await readFile(values.manifest, "utf8"));
  const only = values.only ? new Set(values.only.split(",")) : null;
  /** @type {Variant[]} */
  const variants = manifest.variants.filter(
    /** @param {Variant} v */ (v) => only === null || only.has(v.id),
  );
  const controller = new AbortController();
  for (const signalName of ["SIGINT", "SIGTERM"]) {
    process.once(signalName, () => {
      console.log(`${signalName}: stopping; the snapshot will be restored`);
      controller.abort();
    });
  }
  const base = {
    baseUrl: values["base-url"] ?? "http://127.0.0.1:1234",
    apiToken: process.env.LMSTUDIO_API_TOKEN || undefined,
    variants,
  };

  switch (values.mode) {
    case "preflight":
      console.log(JSON.stringify(await preflight(base), null, 2));
      return;
    case "download": {
      const admin = createLmStudioAdmin(base);
      for (const variant of variants.filter((v) => v.downloadRef)) {
        console.log(
          variant.id,
          JSON.stringify(await admin.download(String(variant.downloadRef))),
        );
      }
      return;
    }
    case "restore": {
      const { snapshot } = JSON.parse(
        await readFile(values.state ?? "state.json", "utf8"),
      );
      await createLmStudioAdmin(base).restore(snapshot);
      console.log("restored");
      return;
    }
    case "run": {
      if (!values.fixture) {
        throw new Error("--fixture is required for --mode run");
      }
      const { items } = JSON.parse(await readFile(values.fixture, "utf8"));
      if (values["start-at"]) {
        const waitMs = msUntil(values["start-at"], new Date());
        console.log(
          `waiting ${Math.round(waitMs / 60000)} min until ${values["start-at"]}`,
        );
        await delay(waitMs, undefined, { signal: controller.signal });
      }
      await runBakeoff({
        ...base,
        items,
        resultsPath: values.out ?? "results.jsonl",
        statePath: values.state ?? "state.json",
        reps: Number(values.reps),
        signal: controller.signal,
      });
      console.log("done");
      return;
    }
    default:
      throw new Error(`unknown --mode ${values.mode}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: the Step 2 command. Expected: 3 tests PASS. If the first test hangs, a background loop is not observing the stop signal — check that `stop.abort()` runs in `finally` and that `streamCompletion` receives the combined signal.

- [ ] **Step 5: Run every bake-off test together and typecheck**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/local-llm-bakeoff-*.test.ts && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 6: Lint, format, commit**

```bash
pnpm exec eslint scripts/local-llm-bakeoff/run-bakeoff.mjs test/local-llm-bakeoff-runner.test.ts
pnpm exec prettier --check scripts/local-llm-bakeoff/run-bakeoff.mjs test/local-llm-bakeoff-runner.test.ts
git add scripts/local-llm-bakeoff/run-bakeoff.mjs test/local-llm-bakeoff-runner.test.ts
git commit -m "feat(bakeoff): overnight runner with thinking probe, concurrency pass and restore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Fixture recording pipeline

**Files:**

- Create: `scripts/local-llm-bakeoff/recorder.mjs`, `scripts/local-llm-bakeoff/fixture.mjs`, `scripts/local-llm-bakeoff/private-path.mjs`, `scripts/local-llm-bakeoff/record-fixture.ts`
- Test: `test/local-llm-bakeoff-recording.test.ts`

**Interfaces:**

- Consumes: `readChatResponseBody` from `scripts/smoke/lib/chat-response.ts`; `withAbortTimeout` from `scripts/smoke/lib/smoke-core.ts`; `readJsonl` (Task 3).
- Produces: `startRecorder({ port: number; logPath: string; host?: string }): Promise<{ url: string; close(): Promise<void> }>`; `STUB_ANSWER = "Recorded."`; `buildFixture(questions: Question[], recorded: RecordedRequest[]): { items: FixtureItem[] }` (items also carry `auxiliaryCalls: number`); `assertOutsideRepo(target: string, repoRoot: string): void`. Question file shape: `{ "questions": [{ "id": string, "lang": "en" | "ko", "kind": "project" | "out_of_scope" | "multi_turn", "turns": [{ "role": "user" | "assistant", "content": string }] }] }`, last turn always `user`.
- Outputs: `$BAKEOFF_DATA_DIR/fixture.json` (Task 4's `FixtureItem[]` under `items`), `$BAKEOFF_DATA_DIR/reference-results.jsonl` (rows `{ variant: "gpt-6-luna", key: "gpt-6-luna", pass: "baseline", itemId, rep: 1, ok, text, source: "app" }`).

How it captures the exact input: the dev app's existing LM Studio provider is pointed at the recorder (`LMSTUDIO_BASE_URL`), and each chat request selects the catalog's LM Studio model through `sessionConfig.llmModel` (a user-tunable key). The recorder logs what the app sends and answers "Recorded.". Two checks catch a silent reroute — for example, the model allowlist substituting a cloud model: the chat answer must contain the stub, and every question must have a streamed request in the log.

- [ ] **Step 1: Write the failing test**

```ts
// test/local-llm-bakeoff-recording.test.ts
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildFixture } from "@/scripts/local-llm-bakeoff/fixture.mjs";
import { assertOutsideRepo } from "@/scripts/local-llm-bakeoff/private-path.mjs";
import {
  STUB_ANSWER,
  startRecorder,
} from "@/scripts/local-llm-bakeoff/recorder.mjs";
import { readJsonl } from "@/scripts/local-llm-bakeoff/results-store.mjs";

void test("the recorder logs labelled requests and answers with the stub", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-rec-"));
  const recorder = await startRecorder({
    port: 0,
    logPath: join(dir, "log.jsonl"),
  });
  try {
    await fetch(`${recorder.url}/__label`, {
      method: "POST",
      body: JSON.stringify({ label: "q1" }),
    });
    const streamed = await fetch(`${recorder.url}/v1/chat/completions`, {
      method: "POST",
      body: JSON.stringify({
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    assert.match(await streamed.text(), new RegExp(STUB_ANSWER));
    const plain = await fetch(`${recorder.url}/v1/chat/completions`, {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "rewrite" }],
      }),
    });
    const payload = (await plain.json()) as {
      choices: { message: { content: string } }[];
    };
    assert.equal(payload.choices[0]?.message.content, STUB_ANSWER);
    const log = await readJsonl(join(dir, "log.jsonl"));
    assert.deepEqual(
      log.map((row) => [row.label, row.seq]),
      [
        ["q1", 1],
        ["q1", 2],
      ],
    );
  } finally {
    await recorder.close();
    await rm(dir, { recursive: true, force: true });
  }
});

const question = {
  id: "q1",
  lang: "en" as const,
  kind: "project" as const,
  turns: [{ role: "user" as const, content: "What did Jack build?" }],
};

void test("buildFixture keeps the last streamed request and counts auxiliary calls", () => {
  const fixture = buildFixture(
    [question],
    [
      {
        label: "q1",
        seq: 1,
        body: {
          stream: false,
          messages: [{ role: "user", content: "rewrite this" }],
        },
      },
      {
        label: "q1",
        seq: 2,
        body: {
          stream: true,
          temperature: 0.3,
          max_tokens: 700,
          messages: [
            { role: "system", content: "Context: ..." },
            { role: "user", content: "What did Jack build?" },
          ],
        },
      },
    ],
  );
  assert.deepEqual(fixture.items[0], {
    id: "q1",
    lang: "en",
    kind: "project",
    messages: [
      { role: "system", content: "Context: ..." },
      { role: "user", content: "What did Jack build?" },
    ],
    temperature: 0.3,
    maxTokens: 700,
    auxiliaryCalls: 1,
  });
});

void test("buildFixture refuses a question the app never sent to the recorder", () => {
  assert.throws(
    () => buildFixture([question], []),
    /no streamed request recorded for q1/,
  );
});

void test("buildFixture refuses a request that does not end with the question", () => {
  assert.throws(
    () =>
      buildFixture(
        [question],
        [
          {
            label: "q1",
            seq: 1,
            body: {
              stream: true,
              messages: [{ role: "user", content: "other" }],
            },
          },
        ],
      ),
    /does not end with its question/,
  );
});

void test("private data paths must sit outside the repository", () => {
  assert.throws(
    () => assertOutsideRepo("/repo/data", "/repo"),
    /inside the repository/,
  );
  assert.throws(
    () => assertOutsideRepo("/repo", "/repo"),
    /inside the repository/,
  );
  assert.doesNotThrow(() => assertOutsideRepo("/private/bakeoff", "/repo"));
  assert.doesNotThrow(() => assertOutsideRepo("/repo-data", "/repo"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/local-llm-bakeoff-recording.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the recorder, fixture builder and path guard**

```js
#!/usr/bin/env node
// scripts/local-llm-bakeoff/recorder.mjs
import { once } from "node:events";
import { appendFile } from "node:fs/promises";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const STUB_ANSWER = "Recorded.";
const STUB_MODEL = "recorder-stub";

/** @param {import("node:http").IncomingMessage} req */
async function readBody(req) {
  /** @type {Buffer[]} */
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

/** @param {import("node:http").ServerResponse} res */
function sendStubStream(res) {
  const base = {
    id: "stub",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: STUB_MODEL,
  };
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: STUB_ANSWER }, finish_reason: null }] })}\n\n`,
  );
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
  );
  res.end("data: [DONE]\n\n");
}

function stubCompletion() {
  return {
    id: "stub",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: STUB_MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: STUB_ANSWER },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 1, total_tokens: 1 },
  };
}

/**
 * OpenAI-compatible stand-in that stores every chat request the app sends
 * and answers with a fixed stub. Pointing the app's LM Studio provider here
 * captures the exact messages the app assembles, retrieval included.
 * `POST /__label {label}` tags the requests that follow.
 * @param {{ port: number; logPath: string; host?: string }} options
 */
export async function startRecorder({ port, logPath, host = "127.0.0.1" }) {
  /** @type {string | null} */
  let label = null;
  let seq = 0;
  const server = createServer(async (req, res) => {
    try {
      const raw = await readBody(req);
      if (req.method === "POST" && req.url === "/__label") {
        label = JSON.parse(raw).label ?? null;
        return sendJson(res, 200, { label });
      }
      if (req.method === "GET" && req.url === "/v1/models") {
        return sendJson(res, 200, {
          object: "list",
          data: [{ id: STUB_MODEL, object: "model" }],
        });
      }
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const body = JSON.parse(raw);
        seq += 1;
        await appendFile(
          logPath,
          `${JSON.stringify({ label, seq, receivedAt: new Date().toISOString(), body })}\n`,
        );
        return body.stream
          ? sendStubStream(res)
          : sendJson(res, 200, stubCompletion());
      }
      return sendJson(res, 404, {
        error: `recorder does not serve ${req.method} ${req.url}`,
      });
    } catch (error) {
      return sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  server.listen(port, host);
  await once(server, "listening");
  const address = server.address();
  const boundPort =
    typeof address === "object" && address !== null ? address.port : port;
  return {
    url: `http://${host}:${boundPort}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve(undefined));
      }),
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      port: { type: "string", default: "18080" },
      log: { type: "string" },
    },
  });
  if (!values.log) {
    throw new Error("--log is required");
  }
  const recorder = await startRecorder({
    port: Number(values.port),
    logPath: values.log,
  });
  console.log(
    `recorder listening on ${recorder.url}; set LMSTUDIO_BASE_URL=${recorder.url}/v1`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

```js
// scripts/local-llm-bakeoff/fixture.mjs

/**
 * @typedef {{ role: "system" | "user" | "assistant"; content: string }} ChatMessage
 * @typedef {{ id: string; lang: "en" | "ko"; kind: "project" | "out_of_scope" | "multi_turn"; turns: ChatMessage[] }} Question
 * @typedef {{ label: string | null; seq: number; body: { stream?: boolean; temperature?: number; max_tokens?: number; max_completion_tokens?: number; messages: { role: string; content: unknown }[] } }} RecordedRequest
 */

/** @param {Question} question */
function finalUserText(question) {
  const last = question.turns.at(-1);
  if (!last || last.role !== "user") {
    throw new Error(`question ${question.id} must end with a user turn`);
  }
  return last.content;
}

/**
 * For each question, keeps the request that produced the streamed answer: the
 * last streamed call recorded under its label. Earlier calls under the same
 * label are auxiliary (query rewrite, summary) and only counted.
 * @param {Question[]} questions
 * @param {RecordedRequest[]} recorded
 */
export function buildFixture(questions, recorded) {
  const items = questions.map((question) => {
    const calls = recorded.filter((request) => request.label === question.id);
    const main = calls.filter((request) => request.body.stream === true).at(-1);
    if (!main) {
      throw new Error(
        `no streamed request recorded for ${question.id}; the app did not route it to the recorder (check the model allowlist and LMSTUDIO_BASE_URL)`,
      );
    }
    const last = main.body.messages.at(-1);
    if (
      !last ||
      last.role !== "user" ||
      typeof last.content !== "string" ||
      !last.content.includes(finalUserText(question))
    ) {
      throw new Error(
        `recorded answer request for ${question.id} does not end with its question`,
      );
    }
    return {
      id: question.id,
      lang: question.lang,
      kind: question.kind,
      messages: main.body.messages.map((message) => ({
        role: message.role,
        content: String(message.content),
      })),
      temperature:
        typeof main.body.temperature === "number"
          ? main.body.temperature
          : null,
      maxTokens:
        main.body.max_tokens ?? main.body.max_completion_tokens ?? null,
      auxiliaryCalls: calls.length - 1,
    };
  });
  return { items };
}
```

```js
// scripts/local-llm-bakeoff/private-path.mjs
import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Real visitor questions must never land in this public repository.
 * @param {string} target
 * @param {string} repoRoot
 */
export function assertOutsideRepo(target, repoRoot) {
  const rel = relative(resolve(repoRoot), resolve(target));
  const outside = rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  if (!outside) {
    throw new Error(
      `${target} is inside the repository; private evaluation data must live outside it`,
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: the Step 2 command. Expected: 5 tests PASS.

- [ ] **Step 5: Write the driver**

```ts
// scripts/local-llm-bakeoff/record-fixture.ts
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { readChatResponseBody } from "../smoke/lib/chat-response";
import { withAbortTimeout } from "../smoke/lib/smoke-core";
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
  return withAbortTimeout(REQUEST_TIMEOUT_MS, async (signal) => {
    const response = await fetch(`${values.app}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        sessionConfig
          ? { messages: turns, sessionConfig }
          : { messages: turns },
      ),
      signal,
    });
    if (response.status !== 200) {
      throw new Error(
        `HTTP ${response.status} ${await response.text()}`.trim(),
      );
    }
    return readChatResponseBody(response);
  });
}

async function recordLocalPass(
  questions: Question[],
  outDir: string,
  recorderLog: string,
) {
  for (const question of questions) {
    await fetch(`${values.recorder}/__label`, {
      method: "POST",
      body: JSON.stringify({ label: question.id }),
    });
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
      await appendFile(
        path,
        `${JSON.stringify({ ...identity, ok: true, text: result.answerText })}\n`,
      );
      console.log(`[reference] ${question.id} ok`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
    await recordLocalPass(questions, outDir, values["recorder-log"]);
  } else if (values.pass === "reference") {
    await recordReferencePass(questions, outDir);
  } else {
    throw new Error('--pass must be "local" or "reference"');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. If `buildFixture`'s JSDoc parameter type rejects the `readJsonl` rows, keep the `Parameters<typeof buildFixture>[1]` cast shown above — it narrows from `Record<string, unknown>[]` without `any`.

- [ ] **Step 7: Lint, format, commit**

```bash
pnpm exec eslint scripts/local-llm-bakeoff/recorder.mjs scripts/local-llm-bakeoff/fixture.mjs scripts/local-llm-bakeoff/private-path.mjs scripts/local-llm-bakeoff/record-fixture.ts test/local-llm-bakeoff-recording.test.ts
pnpm exec prettier --check scripts/local-llm-bakeoff/recorder.mjs scripts/local-llm-bakeoff/fixture.mjs scripts/local-llm-bakeoff/private-path.mjs scripts/local-llm-bakeoff/record-fixture.ts test/local-llm-bakeoff-recording.test.ts
git add scripts/local-llm-bakeoff/recorder.mjs scripts/local-llm-bakeoff/fixture.mjs scripts/local-llm-bakeoff/private-path.mjs scripts/local-llm-bakeoff/record-fixture.ts test/local-llm-bakeoff-recording.test.ts
git commit -m "feat(bakeoff): record frozen fixtures at the wire and capture reference answers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Judge scoring

**Files:**

- Modify: `package.json` (devDependency `@anthropic-ai/sdk`)
- Create: `scripts/local-llm-bakeoff/judge.ts`, `scripts/local-llm-bakeoff/score.ts`
- Test: `test/local-llm-bakeoff-judge.test.ts`

**Interfaces:**

- Consumes: `fixture.json` items (Task 5), result rows (Task 4), reference rows (Task 5), `readJsonl` (Task 3).
- Produces: `JUDGE_MODEL`, `JUDGE_SYSTEM`, `JUDGE_SCHEMA`, `buildJudgePrompt(item: FixtureItem, answer: string): string`, `parseVerdict(text: string): JudgeVerdict`; score rows in `scores.jsonl`: `{ variant, itemId, lang, kind, grounded, ungrounded_claims, correctness, refused, format_ok, language_match, rationale, judgeModel }` or `{ variant, itemId, lang, kind, judgeError }`.

Every answer — candidates and gpt-6-luna alike — is graded against the same input and rubric, with no reference answer shown. That keeps the gpt-6-luna score comparable, which the quality ratio needs. Only baseline rep 1 is judged. The judge is Claude Opus 5 (a model distinct from every candidate) with server-side refusal fallback enabled; its spend is printed and requires `--yes`.

- [ ] **Step 1: Add the SDK**

Run: `pnpm add -D @anthropic-ai/sdk@^0.95.2`
Expected: `package.json` gains the devDependency and the lockfile resolves to the already-present 0.95.x — no new transitive packages.

- [ ] **Step 2: Write the failing test**

```ts
// test/local-llm-bakeoff-judge.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJudgePrompt,
  JUDGE_SCHEMA,
  parseVerdict,
} from "@/scripts/local-llm-bakeoff/judge";

const item = {
  id: "q1",
  lang: "en" as const,
  kind: "project" as const,
  messages: [
    { role: "system" as const, content: "Context: Jack built X." },
    { role: "user" as const, content: "What did Jack build?" },
  ],
  temperature: null,
  maxTokens: null,
};

const verdict = {
  grounded: true,
  ungrounded_claims: [],
  correctness: 5,
  refused: false,
  format_ok: true,
  language_match: true,
  rationale: "Supported.",
};

void test("the judge prompt carries the full assistant input and the answer", () => {
  const prompt = buildJudgePrompt(item, "He built X.");
  assert.match(prompt, /<system>\nContext: Jack built X\.\n<\/system>/);
  assert.match(prompt, /<user>\nWhat did Jack build\?\n<\/user>/);
  assert.match(prompt, /<answer_to_grade>\nHe built X\.\n<\/answer_to_grade>/);
});

void test("the schema requires every property it declares", () => {
  assert.deepEqual(
    [...JUDGE_SCHEMA.required].sort(),
    Object.keys(JUDGE_SCHEMA.properties).sort(),
  );
});

void test("parseVerdict accepts a complete verdict and rejects a broken one", () => {
  assert.deepEqual(parseVerdict(JSON.stringify(verdict)), verdict);
  const missing: Record<string, unknown> = { ...verdict };
  delete missing.grounded;
  assert.throws(
    () => parseVerdict(JSON.stringify(missing)),
    /missing grounded/,
  );
  assert.throws(
    () => parseVerdict(JSON.stringify({ ...verdict, correctness: 9 })),
    /out of range/,
  );
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/local-llm-bakeoff-judge.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 4: Write `judge.ts`**

```ts
// scripts/local-llm-bakeoff/judge.ts
export const JUDGE_MODEL = "claude-opus-5";

export type FixtureMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
export type FixtureItem = {
  id: string;
  lang: "en" | "ko";
  kind: "project" | "out_of_scope" | "multi_turn";
  messages: FixtureMessage[];
  temperature: number | null;
  maxTokens: number | null;
};

export type JudgeVerdict = {
  grounded: boolean;
  ungrounded_claims: string[];
  correctness: 1 | 2 | 3 | 4 | 5;
  refused: boolean;
  format_ok: boolean;
  language_match: boolean;
  rationale: string;
};

export const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    grounded: { type: "boolean" },
    ungrounded_claims: { type: "array", items: { type: "string" } },
    correctness: { type: "integer", enum: [1, 2, 3, 4, 5] },
    refused: { type: "boolean" },
    format_ok: { type: "boolean" },
    language_match: { type: "boolean" },
    rationale: { type: "string" },
  },
  required: [
    "grounded",
    "ungrounded_claims",
    "correctness",
    "refused",
    "format_ok",
    "language_match",
    "rationale",
  ],
  additionalProperties: false,
} as const;

export const JUDGE_SYSTEM = `You grade one answer from a question-answering assistant on a personal portfolio site. You see the exact input the assistant received — its system prompt holds the retrieved context and its rules — and the answer. Grade only against that input; use no outside knowledge about the person.

- grounded: true when every factual claim about the person, their work, dates, employers, numbers or projects is supported by the input (retrieved context or earlier turns). Conversational phrasing is not a claim. List each unsupported claim in ungrounded_claims, quoting it briefly.
- correctness (1-5): how completely and accurately the answer addresses the final user question with what the input supports. A refusal when the input lacks the answer scores 5; refusing when the input contains the answer scores 1.
- refused: true when the answer declines or says the information is not available.
- format_ok: true when the answer follows every formatting and length rule in the assistant's system prompt.
- language_match: true when the answer is written in the language of the final user question.
- rationale: at most two sentences.`;

export function buildJudgePrompt(item: FixtureItem, answer: string): string {
  const transcript = item.messages
    .map(
      (message) => `<${message.role}>\n${message.content}\n</${message.role}>`,
    )
    .join("\n");
  return [
    "<assistant_input>",
    transcript,
    "</assistant_input>",
    "<answer_to_grade>",
    answer,
    "</answer_to_grade>",
  ].join("\n");
}

export function parseVerdict(text: string): JudgeVerdict {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null) {
    throw new Error("judge output is not an object");
  }
  for (const key of JUDGE_SCHEMA.required) {
    if (!(key in value)) {
      throw new Error(`judge output missing ${key}`);
    }
  }
  const correctness = (value as { correctness: unknown }).correctness;
  if (
    typeof correctness !== "number" ||
    ![1, 2, 3, 4, 5].includes(correctness)
  ) {
    throw new Error(`judge correctness out of range: ${String(correctness)}`);
  }
  return value as JudgeVerdict;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: the Step 3 command. Expected: 3 tests PASS.

- [ ] **Step 6: Write `score.ts`**

```ts
// scripts/local-llm-bakeoff/score.ts
import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { parseArgs } from "node:util";

import Anthropic from "@anthropic-ai/sdk";

import {
  buildJudgePrompt,
  type FixtureItem,
  JUDGE_MODEL,
  JUDGE_SCHEMA,
  JUDGE_SYSTEM,
  parseVerdict,
} from "./judge";
import { assertOutsideRepo } from "./private-path.mjs";
import { readJsonl } from "./results-store.mjs";

// Claude Opus 5 list price, USD per million tokens. The output estimate
// includes adaptive thinking, which is billed as output.
const INPUT_USD_PER_MTOK = 5;
const OUTPUT_USD_PER_MTOK = 25;
const ESTIMATED_OUTPUT_TOKENS = 3000;
const CONCURRENCY = 4;

type AnswerRow = { variant: string; itemId: string; text: string };

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const { values } = parseArgs({
  options: {
    fixture: { type: "string" },
    results: { type: "string", multiple: true },
    out: { type: "string" },
    yes: { type: "boolean", default: false },
  },
});

async function pool<T>(
  inputs: T[],
  size: number,
  worker: (input: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < inputs.length) {
        const input = inputs[next];
        next += 1;
        await worker(input);
      }
    }),
  );
}

function toAnswerRows(rows: Record<string, unknown>[]): AnswerRow[] {
  return rows.flatMap((row) =>
    row.pass === "baseline" &&
    row.rep === 1 &&
    row.ok === true &&
    typeof row.text === "string"
      ? [
          {
            variant: String(row.variant),
            itemId: String(row.itemId),
            text: row.text,
          },
        ]
      : [],
  );
}

async function main() {
  if (!values.fixture || !values.results?.length || !values.out) {
    throw new Error("--fixture, at least one --results and --out are required");
  }
  const outPath = values.out;
  assertOutsideRepo(outPath, repoRoot);
  const { items } = JSON.parse(await readFile(values.fixture, "utf8")) as {
    items: FixtureItem[];
  };
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const answers = (
    await Promise.all(values.results.map((path) => readJsonl(path)))
  ).flatMap(toAnswerRows);
  const done = new Set(
    (await readJsonl(outPath).catch(() => [])).map(
      (row) => `${String(row.variant)}|${String(row.itemId)}`,
    ),
  );
  const pending = answers.filter(
    (answer) => !done.has(`${answer.variant}|${answer.itemId}`),
  );

  const inputTokens = pending.reduce((sum, answer) => {
    const item = itemsById.get(answer.itemId);
    return (
      sum +
      (item
        ? (JUDGE_SYSTEM.length + buildJudgePrompt(item, answer.text).length) / 4
        : 0)
    );
  }, 0);
  const usd =
    (inputTokens * INPUT_USD_PER_MTOK +
      pending.length * ESTIMATED_OUTPUT_TOKENS * OUTPUT_USD_PER_MTOK) /
    1_000_000;
  console.log(
    `${pending.length} answers to judge with ${JUDGE_MODEL}; estimated cost ≈ $${usd.toFixed(2)}`,
  );
  if (!values.yes) {
    console.log("Rerun with --yes to spend it.");
    return;
  }

  const client = new Anthropic({ maxRetries: 5 });
  await pool(pending, CONCURRENCY, async (answer) => {
    const item = itemsById.get(answer.itemId);
    if (!item) {
      throw new Error(`answer for unknown fixture item ${answer.itemId}`);
    }
    const base = {
      variant: answer.variant,
      itemId: answer.itemId,
      lang: item.lang,
      kind: item.kind,
    };
    try {
      const response = await client.beta.messages.create({
        model: JUDGE_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: {
          effort: "high",
          format: { type: "json_schema", schema: JUDGE_SCHEMA },
        },
        system: JUDGE_SYSTEM,
        messages: [
          { role: "user", content: buildJudgePrompt(item, answer.text) },
        ],
      });
      if (response.stop_reason === "refusal") {
        await appendFile(
          outPath,
          `${JSON.stringify({ ...base, judgeError: "refusal" })}\n`,
        );
        return;
      }
      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");
      await appendFile(
        outPath,
        `${JSON.stringify({ ...base, ...parseVerdict(text), judgeModel: response.model })}\n`,
      );
      console.log(`[score] ${answer.variant} ${answer.itemId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await appendFile(
        outPath,
        `${JSON.stringify({ ...base, judgeError: message })}\n`,
      );
      console.error(
        `[score] ${answer.variant} ${answer.itemId} failed: ${message}`,
      );
    }
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. If the installed SDK's types do not yet declare `fallbacks` or the `server-side-fallback-2026-07-01` beta, upgrade the devDependency to the newest `@anthropic-ai/sdk` that does (`pnpm add -D @anthropic-ai/sdk@latest`) and rerun; do not cast around it.

- [ ] **Step 8: Lint, format, commit**

```bash
pnpm exec eslint scripts/local-llm-bakeoff/judge.ts scripts/local-llm-bakeoff/score.ts test/local-llm-bakeoff-judge.test.ts
pnpm exec prettier --check scripts/local-llm-bakeoff/judge.ts scripts/local-llm-bakeoff/score.ts test/local-llm-bakeoff-judge.test.ts
git add package.json pnpm-lock.yaml scripts/local-llm-bakeoff/judge.ts scripts/local-llm-bakeoff/score.ts test/local-llm-bakeoff-judge.test.ts
git commit -m "feat(bakeoff): Claude judge with a shared rubric for candidates and reference

@anthropic-ai/sdk is added as a devDependency; it was already in the
lockfile through @langchain/anthropic, so nothing new is installed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Summary, gate and report

**Files:**

- Create: `scripts/local-llm-bakeoff/summarize.ts`, `scripts/local-llm-bakeoff/report.ts`
- Test: `test/local-llm-bakeoff-summarize.test.ts`

**Interfaces:**

- Consumes: result rows (Task 4), reference rows (Task 5), score rows (Task 6), `reviews.json` (`{ "reviews": [{ "variant", "itemId", "confirmedUngrounded": boolean }] }`, written by hand during flagged-item review).
- Produces: `GATE`, `REFERENCE_VARIANT`, `percentile(values: number[], p: number): number | null`, `summarize(results: ResultRow[], scores: ScoreRow[], reviews: Review[]): VariantSummary[]`, `renderReport(summaries: VariantSummary[]): string`.

The report lists flagged items by id only — no question text — so it can be shared; the private data directory still holds it by default.

- [ ] **Step 1: Write the failing test**

```ts
// test/local-llm-bakeoff-summarize.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  percentile,
  renderReport,
  type ResultRow,
  type ScoreRow,
  summarize,
} from "@/scripts/local-llm-bakeoff/summarize";

void test("percentile uses nearest rank", () => {
  const values = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5];
  assert.equal(percentile(values, 50), 5);
  assert.equal(percentile(values, 95), 10);
  assert.equal(percentile([], 50), null);
});

function speedRows(
  variant: string,
  ttftMs: number,
  decode: number,
): ResultRow[] {
  return ["q1", "q2"].flatMap((itemId) => [
    {
      variant,
      pass: "baseline",
      itemId,
      rep: 1,
      ok: true,
      ttftMs,
      decodeTokensPerSecond: decode,
    },
    {
      variant,
      pass: "concurrent",
      itemId,
      rep: 1,
      ok: true,
      ttftMs: ttftMs * 2,
      decodeTokensPerSecond: decode,
    },
  ]);
}

function score(
  variant: string,
  itemId: string,
  kind: string,
  overrides: Partial<ScoreRow> = {},
): ScoreRow {
  return {
    variant,
    itemId,
    kind,
    grounded: true,
    correctness: 5,
    refused: kind === "out_of_scope",
    format_ok: true,
    language_match: true,
    ...overrides,
  };
}

const reference = [
  score("gpt-6-luna", "q1", "project"),
  score("gpt-6-luna", "q2", "out_of_scope"),
];

void test("a fast, grounded variant passes and the reference is marked as such", () => {
  const results: ResultRow[] = [
    ...speedRows("fast", 800, 60),
    { variant: "fast", pass: "memory", itemId: "-", rep: 0, deltaBytes: 18e9 },
  ];
  const scores = [
    ...reference,
    score("fast", "q1", "project"),
    score("fast", "q2", "out_of_scope"),
  ];
  const summaries = summarize(results, scores, []);
  const [fast, luna] = summaries;
  assert.ok(fast && luna);
  assert.equal(fast.variant, "fast");
  assert.equal(fast.gate, "pass");
  assert.equal(fast.fits20Gb, true);
  assert.equal(fast.concurrentTtftP95Ms, 1600);
  assert.equal(luna.gate, "reference");
  assert.match(renderReport(summaries), /\| fast \| pass \|/);
});

void test("slow decoding fails; an unreviewed ungrounded flag is pending; a confirmed one fails", () => {
  const scores = [
    ...reference,
    score("slow", "q1", "project"),
    score("slow", "q2", "out_of_scope"),
    score("shaky", "q1", "project", {
      grounded: false,
      ungrounded_claims: ["invented employer"],
    }),
    score("shaky", "q2", "out_of_scope"),
  ];
  const results = [
    ...speedRows("slow", 800, 20),
    ...speedRows("shaky", 800, 60),
  ];
  const pending = summarize(results, scores, []);
  assert.deepEqual(pending.find((s) => s.variant === "slow")?.failedCriteria, [
    "decode_p50",
  ]);
  assert.equal(
    pending.find((s) => s.variant === "shaky")?.gate,
    "pending-review",
  );
  const confirmed = summarize(results, scores, [
    { variant: "shaky", itemId: "q1", confirmedUngrounded: true },
  ]);
  assert.deepEqual(
    confirmed.find((s) => s.variant === "shaky")?.failedCriteria,
    ["groundedness"],
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `TSX_TSCONFIG_PATH=test/tsconfig.json node --import tsx --import ./test/helpers/css-stub-loader.mjs --test test/local-llm-bakeoff-summarize.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `summarize.ts`**

```ts
// scripts/local-llm-bakeoff/summarize.ts
export const REFERENCE_VARIANT = "gpt-6-luna";

export const GATE = {
  ttftP50Ms: 1500,
  ttftP95Ms: 3000,
  decodeP50: 40,
  refusalMin: 0.9,
  qualityRatioMin: 0.9,
  formatMin: 0.9,
} as const;

const GB = 1e9;

export type ResultRow = {
  variant: string;
  pass: string;
  itemId: string;
  rep: number;
  ok?: boolean;
  ttftMs?: number | null;
  decodeTokensPerSecond?: number | null;
  deltaBytes?: number;
  error?: string;
};

export type ScoreRow = {
  variant: string;
  itemId: string;
  kind?: string;
  grounded?: boolean;
  ungrounded_claims?: string[];
  correctness?: number;
  refused?: boolean;
  format_ok?: boolean;
  language_match?: boolean;
  judgeError?: string;
};

export type Review = {
  variant: string;
  itemId: string;
  confirmedUngrounded: boolean;
};

export type VariantSummary = {
  variant: string;
  requests: number;
  errors: number;
  ttftP50Ms: number | null;
  ttftP95Ms: number | null;
  decodeP50: number | null;
  concurrentTtftP95Ms: number | null;
  memoryDeltaGb: number | null;
  fits40Gb: boolean | null;
  fits20Gb: boolean | null;
  scored: number;
  judgeErrors: number;
  meanCorrectness: number | null;
  qualityRatio: number | null;
  refusalCorrectRate: number | null;
  overRefusalRate: number | null;
  formatRate: number | null;
  languageMatchRate: number | null;
  flaggedUngrounded: string[];
  confirmedUngrounded: number;
  pendingReview: number;
  gate: "pass" | "fail" | "pending-review" | "reference";
  failedCriteria: string[];
};

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? null;
}

function mean(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function rate<T>(rows: T[], predicate: (row: T) => boolean): number | null {
  return rows.length === 0 ? null : rows.filter(predicate).length / rows.length;
}

function numbers(values: (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => typeof v === "number");
}

export function summarize(
  results: ResultRow[],
  scores: ScoreRow[],
  reviews: Review[],
): VariantSummary[] {
  const validScores = scores.filter((s) => s.judgeError === undefined);
  const referenceMean = mean(
    numbers(
      validScores
        .filter((s) => s.variant === REFERENCE_VARIANT)
        .map((s) => s.correctness),
    ),
  );
  const variants = [
    ...new Set([
      ...results.map((r) => r.variant),
      ...scores.map((s) => s.variant),
    ]),
  ].sort((a, b) =>
    a === REFERENCE_VARIANT
      ? 1
      : b === REFERENCE_VARIANT
        ? -1
        : a.localeCompare(b),
  );

  return variants.map((variant) => {
    const baseline = results.filter(
      (r) => r.variant === variant && r.pass === "baseline",
    );
    const okBaseline = baseline.filter((r) => r.ok === true);
    const concurrent = results.filter(
      (r) => r.variant === variant && r.pass === "concurrent" && r.ok === true,
    );
    const memory = results.find(
      (r) => r.variant === variant && r.pass === "memory",
    );
    const own = validScores.filter((s) => s.variant === variant);
    const outOfScope = own.filter((s) => s.kind === "out_of_scope");
    const inScope = own.filter((s) => s.kind !== "out_of_scope");
    const flagged = own
      .filter((s) => s.grounded === false)
      .map((s) => s.itemId);
    const reviewFor = (itemId: string) =>
      reviews.find((r) => r.variant === variant && r.itemId === itemId);
    const confirmed = flagged.filter(
      (itemId) => reviewFor(itemId)?.confirmedUngrounded === true,
    ).length;
    const pendingReview = flagged.filter(
      (itemId) => reviewFor(itemId) === undefined,
    ).length;
    const meanCorrectness = mean(numbers(own.map((s) => s.correctness)));
    const memoryDeltaGb =
      typeof memory?.deltaBytes === "number" ? memory.deltaBytes / GB : null;

    const summary: VariantSummary = {
      variant,
      requests: baseline.length,
      errors: baseline.length - okBaseline.length,
      ttftP50Ms: percentile(numbers(okBaseline.map((r) => r.ttftMs)), 50),
      ttftP95Ms: percentile(numbers(okBaseline.map((r) => r.ttftMs)), 95),
      decodeP50: percentile(
        numbers(okBaseline.map((r) => r.decodeTokensPerSecond)),
        50,
      ),
      concurrentTtftP95Ms: percentile(
        numbers(concurrent.map((r) => r.ttftMs)),
        95,
      ),
      memoryDeltaGb,
      fits40Gb: memoryDeltaGb === null ? null : memoryDeltaGb <= 40,
      fits20Gb: memoryDeltaGb === null ? null : memoryDeltaGb <= 20,
      scored: own.length,
      judgeErrors: scores.filter(
        (s) => s.variant === variant && s.judgeError !== undefined,
      ).length,
      meanCorrectness,
      qualityRatio:
        meanCorrectness !== null && referenceMean
          ? meanCorrectness / referenceMean
          : null,
      refusalCorrectRate: rate(outOfScope, (s) => s.refused === true),
      overRefusalRate: rate(inScope, (s) => s.refused === true),
      formatRate: rate(own, (s) => s.format_ok === true),
      languageMatchRate: rate(own, (s) => s.language_match === true),
      flaggedUngrounded: flagged,
      confirmedUngrounded: confirmed,
      pendingReview,
      gate: "reference",
      failedCriteria: [],
    };
    if (variant === REFERENCE_VARIANT) {
      return summary;
    }
    // A missing measurement fails its criterion: an unmeasured variant never passes.
    const checks: [string, boolean][] = [
      [
        "ttft_p50",
        summary.ttftP50Ms === null || summary.ttftP50Ms > GATE.ttftP50Ms,
      ],
      [
        "ttft_p95",
        summary.ttftP95Ms === null || summary.ttftP95Ms > GATE.ttftP95Ms,
      ],
      [
        "decode_p50",
        summary.decodeP50 === null || summary.decodeP50 < GATE.decodeP50,
      ],
      ["groundedness", confirmed > 0],
      [
        "refusal",
        summary.refusalCorrectRate === null ||
          summary.refusalCorrectRate < GATE.refusalMin,
      ],
      [
        "quality",
        summary.qualityRatio === null ||
          summary.qualityRatio < GATE.qualityRatioMin,
      ],
      [
        "format",
        summary.formatRate === null || summary.formatRate < GATE.formatMin,
      ],
    ];
    const failed = checks
      .filter(([, failing]) => failing)
      .map(([name]) => name);
    summary.failedCriteria = failed;
    summary.gate =
      failed.length > 0
        ? "fail"
        : pendingReview > 0
          ? "pending-review"
          : "pass";
    return summary;
  });
}

function fmt(value: number | null, digits = 0): string {
  return value === null ? "—" : value.toFixed(digits);
}

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function renderReport(summaries: VariantSummary[]): string {
  const header =
    "| Variant | Gate | TTFT p50 ms | TTFT p95 ms | Decode p50 tok/s | Quality ratio | Refusal | Over-refusal | Format | Language | Ungrounded (confirmed/pending) | Concurrent TTFT p95 ms | Memory Δ GB | Fits 40/20 GB | Errors |";
  const divider = `|${" --- |".repeat(15)}`;
  const rows = summaries.map((s) =>
    [
      s.variant,
      s.gate,
      fmt(s.ttftP50Ms),
      fmt(s.ttftP95Ms),
      fmt(s.decodeP50, 1),
      fmt(s.qualityRatio, 2),
      pct(s.refusalCorrectRate),
      pct(s.overRefusalRate),
      pct(s.formatRate),
      pct(s.languageMatchRate),
      `${s.confirmedUngrounded}/${s.pendingReview}`,
      fmt(s.concurrentTtftP95Ms),
      fmt(s.memoryDeltaGb, 1),
      s.fits40Gb === null
        ? "—"
        : `${s.fits40Gb ? "yes" : "no"}/${s.fits20Gb ? "yes" : "no"}`,
      `${s.errors} run, ${s.judgeErrors} judge`,
    ].join(" | "),
  );
  const details = summaries
    .filter(
      (s) => s.failedCriteria.length > 0 || s.flaggedUngrounded.length > 0,
    )
    .map(
      (s) =>
        `- **${s.variant}**: failed ${s.failedCriteria.join(", ") || "nothing"}; flagged ungrounded items ${s.flaggedUngrounded.join(", ") || "none"}`,
    );
  return [
    "# Local LLM bake-off report",
    "",
    `Gate: TTFT p50 ≤ ${GATE.ttftP50Ms} ms, p95 ≤ ${GATE.ttftP95Ms} ms; decode p50 ≥ ${GATE.decodeP50} tok/s; zero confirmed ungrounded claims; refusal ≥ ${pct(GATE.refusalMin)}; quality ratio ≥ ${GATE.qualityRatioMin}; format ≥ ${pct(GATE.formatMin)}. Memory Δ is approximate (system-wide vm_stat).`,
    "",
    header,
    divider,
    ...rows.map((row) => `| ${row} |`),
    "",
    ...(details.length > 0 ? ["## Details", "", ...details, ""] : []),
  ].join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: the Step 2 command. Expected: 3 tests PASS.

- [ ] **Step 5: Write `report.ts`**

```ts
// scripts/local-llm-bakeoff/report.ts
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { assertOutsideRepo } from "./private-path.mjs";
import { readJsonl } from "./results-store.mjs";
import {
  type Review,
  type ResultRow,
  type ScoreRow,
  renderReport,
  summarize,
} from "./summarize";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const { values } = parseArgs({
  options: {
    results: { type: "string", multiple: true },
    scores: { type: "string" },
    reviews: { type: "string" },
    out: { type: "string" },
  },
});

async function main() {
  if (!values.results?.length || !values.scores || !values.out) {
    throw new Error("at least one --results, --scores and --out are required");
  }
  assertOutsideRepo(values.out, repoRoot);
  const results = (
    await Promise.all(values.results.map((path) => readJsonl(path)))
  ).flat() as ResultRow[];
  const scores = (await readJsonl(values.scores)) as ScoreRow[];
  const reviews: Review[] = values.reviews
    ? (
        JSON.parse(await readFile(values.reviews, "utf8")) as {
          reviews: Review[];
        }
      ).reviews
    : [];
  const summaries = summarize(results, scores, reviews);
  await writeFile(values.out, renderReport(summaries));
  for (const s of summaries) {
    console.log(
      `${s.variant}: ${s.gate}${s.failedCriteria.length ? ` (${s.failedCriteria.join(", ")})` : ""}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 6: Typecheck, lint, format, commit**

```bash
pnpm typecheck
pnpm exec eslint scripts/local-llm-bakeoff/summarize.ts scripts/local-llm-bakeoff/report.ts test/local-llm-bakeoff-summarize.test.ts
pnpm exec prettier --check scripts/local-llm-bakeoff/summarize.ts scripts/local-llm-bakeoff/report.ts test/local-llm-bakeoff-summarize.test.ts
git add scripts/local-llm-bakeoff/summarize.ts scripts/local-llm-bakeoff/report.ts test/local-llm-bakeoff-summarize.test.ts
git commit -m "feat(bakeoff): per-variant summary, gate verdict and markdown report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Manifest, sample questions, runbook, spec alignment

**Files:**

- Create: `scripts/local-llm-bakeoff/manifest.json`, `scripts/local-llm-bakeoff/sample-questions.json`, `scripts/local-llm-bakeoff/README.md`
- Modify: `docs/superpowers/specs/2026-09-26-studio-local-llm-design.md` (Phase A1 "Harness" and "Scoring" paragraphs)

- [ ] **Step 1: Write the manifest**

`key` is the model's LM Studio key after download; `downloadRef` is what `--mode download` requests. The two models already on the host have no `downloadRef`. The three new entries use the LM Studio catalog ids; Task 9 confirms or corrects both fields with `--mode preflight`.

```json
{
  "variants": [
    {
      "id": "qwen3-32b-4bit",
      "key": "qwen3-32b-mlx",
      "role": "previous-generation baseline",
      "downloadRef": null,
      "loadConfig": { "context_length": 16384 },
      "requestExtras": {},
      "thinkingCandidates": [
        {},
        { "chat_template_kwargs": { "enable_thinking": false } },
        { "reasoning_effort": "low" }
      ]
    },
    {
      "id": "qwen3.6-35b-a3b-4bit",
      "key": "qwen3.6-35b-a3b-mlx",
      "role": "speed",
      "downloadRef": null,
      "loadConfig": { "context_length": 16384 },
      "requestExtras": {},
      "thinkingCandidates": [
        {},
        { "chat_template_kwargs": { "enable_thinking": false } },
        { "reasoning_effort": "low" }
      ]
    },
    {
      "id": "gemma-4-26b-a4b-4bit",
      "key": "google/gemma-4-26b-a4b",
      "role": "speed",
      "downloadRef": "google/gemma-4-26b-a4b",
      "loadConfig": { "context_length": 16384 },
      "requestExtras": {},
      "thinkingCandidates": [
        {},
        { "chat_template_kwargs": { "enable_thinking": false } }
      ]
    },
    {
      "id": "gpt-oss-20b",
      "key": "openai/gpt-oss-20b",
      "role": "speed",
      "downloadRef": "openai/gpt-oss-20b",
      "loadConfig": { "context_length": 16384 },
      "requestExtras": {},
      "thinkingCandidates": [{ "reasoning_effort": "low" }, {}]
    },
    {
      "id": "qwen3.8-27b-4bit",
      "key": "qwen/qwen3.8-27b",
      "role": "quality ceiling",
      "downloadRef": "qwen/qwen3.8-27b",
      "loadConfig": { "context_length": 16384 },
      "requestExtras": {},
      "thinkingCandidates": [
        { "chat_template_kwargs": { "enable_thinking": false } },
        { "reasoning_effort": "low" },
        {}
      ]
    }
  ]
}
```

- [ ] **Step 2: Write the sample questions**

Hand-written, for dry runs only; the real set stays private.

```json
{
  "questions": [
    {
      "id": "sample-en-project",
      "lang": "en",
      "kind": "project",
      "turns": [
        {
          "role": "user",
          "content": "What kinds of AI systems has Jack built?"
        }
      ]
    },
    {
      "id": "sample-en-experience",
      "lang": "en",
      "kind": "project",
      "turns": [
        {
          "role": "user",
          "content": "Summarize Jack's background in enterprise mobility and security."
        }
      ]
    },
    {
      "id": "sample-en-out-of-scope",
      "lang": "en",
      "kind": "out_of_scope",
      "turns": [
        { "role": "user", "content": "What is Jack's favorite breakfast?" }
      ]
    },
    {
      "id": "sample-multi-turn",
      "lang": "en",
      "kind": "multi_turn",
      "turns": [
        {
          "role": "user",
          "content": "Does Jack have experience with RAG systems?"
        },
        {
          "role": "assistant",
          "content": "Yes. This site's assistant is itself a retrieval-augmented system he built."
        },
        {
          "role": "user",
          "content": "How does it decide what context to retrieve?"
        }
      ]
    },
    {
      "id": "sample-ko-experience",
      "lang": "ko",
      "kind": "project",
      "turns": [
        {
          "role": "user",
          "content": "잭의 엔터프라이즈 보안 경험을 요약해 줘."
        }
      ]
    }
  ]
}
```

- [ ] **Step 3: Write the runbook**

````markdown
<!-- scripts/local-llm-bakeoff/README.md -->

# Local LLM Bake-off

Measures candidate local models on frozen JackGPT inputs. Design:
[docs/superpowers/specs/2026-09-26-studio-local-llm-design.md](../../docs/superpowers/specs/2026-09-26-studio-local-llm-design.md).

## Environment

| Variable             | Meaning                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `BAKEOFF_DATA_DIR`   | Private directory **outside this repo** for questions, fixtures, results, scores and reports |
| `BAKEOFF_HOST`       | ssh alias of the model host                                                                  |
| `BAKEOFF_HOST_DIR`   | Working directory on the host                                                                |
| `BAKEOFF_NODE`       | Absolute path of Node 22 on the host                                                         |
| `LMSTUDIO_API_TOKEN` | Only if the host's LM Studio requires a token                                                |

## 1. Record the fixture (laptop, any time)

```bash
node scripts/local-llm-bakeoff/recorder.mjs --port 18080 --log "$BAKEOFF_DATA_DIR/recorder-log.jsonl"
```

In a second terminal, start the dev app pointed at the recorder, with chat notifications off:

```bash
LMSTUDIO_BASE_URL=http://127.0.0.1:18080/v1 TELEGRAM_BOT_TOKEN= TELEGRAM_CHAT_ID= pnpm dev
```

Then, in a third terminal:

```bash
pnpm exec tsx scripts/local-llm-bakeoff/record-fixture.ts --pass local --questions "$BAKEOFF_DATA_DIR/questions.json" --out-dir "$BAKEOFF_DATA_DIR" --recorder-log "$BAKEOFF_DATA_DIR/recorder-log.jsonl"
pnpm exec tsx scripts/local-llm-bakeoff/record-fixture.ts --pass reference --questions "$BAKEOFF_DATA_DIR/questions.json" --out-dir "$BAKEOFF_DATA_DIR"
```

## 2. Stage on the host

```bash
ssh "$BAKEOFF_HOST" "mkdir -p $BAKEOFF_HOST_DIR"
scp scripts/local-llm-bakeoff/*.mjs scripts/local-llm-bakeoff/manifest.json "$BAKEOFF_DATA_DIR/fixture.json" "$BAKEOFF_HOST:$BAKEOFF_HOST_DIR/"
ssh "$BAKEOFF_HOST" "cd $BAKEOFF_HOST_DIR && $BAKEOFF_NODE run-bakeoff.mjs --mode preflight --manifest manifest.json"
```

## 3. Run overnight (host, inside the agreed window)

```bash
ssh "$BAKEOFF_HOST" "cd $BAKEOFF_HOST_DIR && nohup caffeinate -i $BAKEOFF_NODE run-bakeoff.mjs --mode run --manifest manifest.json --fixture fixture.json --start-at 01:30 > run.log 2>&1 &"
```

If the process dies, rerun the same command without `--start-at`: finished rows are skipped. If it was killed hard, put the server back first:

```bash
ssh "$BAKEOFF_HOST" "cd $BAKEOFF_HOST_DIR && $BAKEOFF_NODE run-bakeoff.mjs --mode restore --manifest manifest.json --state state.json"
```

## 4. Score and report (laptop)

```bash
scp "$BAKEOFF_HOST:$BAKEOFF_HOST_DIR/{results.jsonl,run.log,state.json}" "$BAKEOFF_DATA_DIR/"
node --import=tsx --env-file=.env.local scripts/local-llm-bakeoff/score.ts --fixture "$BAKEOFF_DATA_DIR/fixture.json" --results "$BAKEOFF_DATA_DIR/results.jsonl" --results "$BAKEOFF_DATA_DIR/reference-results.jsonl" --out "$BAKEOFF_DATA_DIR/scores.jsonl"
```

The first run prints the estimated judge cost; rerun with `--yes` once it is approved. Review every flagged item and record the verdicts in `$BAKEOFF_DATA_DIR/reviews.json`, then:

```bash
pnpm exec tsx scripts/local-llm-bakeoff/report.ts --results "$BAKEOFF_DATA_DIR/results.jsonl" --results "$BAKEOFF_DATA_DIR/reference-results.jsonl" --scores "$BAKEOFF_DATA_DIR/scores.jsonl" --reviews "$BAKEOFF_DATA_DIR/reviews.json" --out "$BAKEOFF_DATA_DIR/report.md"
```
````

- [ ] **Step 4: Align the spec with what was built**

In `docs/superpowers/specs/2026-09-26-studio-local-llm-design.md`:

Replace the paragraph starting "How models are switched" with:

```markdown
Models are switched through LM Studio's REST API (`/api/v1/models/load` and
`/unload`), which the host's server exposes. Each variant's thinking-control
candidates are probed once at the start of its run, and the one producing the
least reasoning is used for measurement, so the probe does not need a
separate window.
```

In the **Scoring** paragraph, replace "correctness against the reference" with "correctness against the input", and append this sentence to the paragraph:

```markdown
The gpt-6-luna answers are captured through the running app and graded with
the same rubric and input, which is what the quality ratio compares.
```

- [ ] **Step 5: Verify and commit**

```bash
pnpm lint:path-leaks
pnpm check:docs
pnpm exec prettier --check scripts/local-llm-bakeoff/manifest.json scripts/local-llm-bakeoff/sample-questions.json scripts/local-llm-bakeoff/README.md docs/superpowers/specs/2026-09-26-studio-local-llm-design.md
git add scripts/local-llm-bakeoff/manifest.json scripts/local-llm-bakeoff/sample-questions.json scripts/local-llm-bakeoff/README.md docs/superpowers/specs/2026-09-26-studio-local-llm-design.md
git commit -m "docs(bakeoff): manifest, sample questions and runbook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Operational Tasks (A1 → A2)

These run the built tooling. Each has a human gate; do not skip them.

### Task 9: Resolve and download the new models (night 1)

- [ ] **Step 1: Resolve refs and sizes.** For each manifest entry with a `downloadRef`, confirm the id on the LM Studio model catalog page and note the MLX 4-bit (or native MXFP4 for gpt-oss) download size. If the catalog id differs, fix `downloadRef` in the manifest.
- [ ] **Step 2: Get approval.** Present the list — model, id, source, size, total — and wait for an explicit yes. Downloads are not started without it.
- [ ] **Step 3: Download.** Copy the updated manifest to the host (runbook §2 `scp`), then:

```bash
ssh "$BAKEOFF_HOST" "cd $BAKEOFF_HOST_DIR && $BAKEOFF_NODE run-bakeoff.mjs --mode download --manifest manifest.json"
```

Expected: one line per model with `"status":"downloading"` or `"already_downloaded"`. Downloading does not load models, so it does not disturb the other consumer.

- [ ] **Step 4: Next morning, preflight.** Run the runbook §2 preflight command. Expected: `"missing": []`. If an entry is missing, find its real key in `"available"`, correct `key` in the manifest, commit the fix, and rerun preflight.

### Task 10: Agree the run window

- [ ] **Step 1: Read the host's scheduled jobs** (read-only) and list those scheduled between 00:00 and 06:00 host time. Check whether any of them call the model server.
- [ ] **Step 2: Confirm with the other consumer's owner** a window of at least 5 hours with no model-server use. Record the agreed start time — it becomes `--start-at` in Task 13.

### Task 11: Build the private question set and record the fixture

- [ ] **Step 1: Write `$BAKEOFF_DATA_DIR/questions.json`** in the Task 5 shape: 30–40 questions drawn from production trace inputs in Langfuse, about 80% English and 20% Korean (adjust to the production mix). Include at least 5 `out_of_scope` questions that must be refused and at least 3 `multi_turn` items. Remove anything that identifies a visitor.
- [ ] **Step 2: Confirm the recorded input does not depend on the model.** The recording selects the LM Studio catalog entry, while production uses gpt-6-luna, so nothing in prompt assembly may branch on the model. Run:

```bash
git grep -nE "isLocal|localBackend|provider ===|llmSelection\.|resolvedLlmModelId" -- lib/server/settings/system-prompt-settings.ts lib/server/guardrails lib/server/langchain lib/server/api/langchain_chat_impl_heavy.ts
```

Expected: every hit is model construction, fallback, telemetry or caching — none changes the system prompt, the retrieved context, or the context/history budgets. If one does, stop: the fixture would not match production input, and the recording approach needs revisiting with Jack.

- [ ] **Step 3: Rehearse with the sample set.** Run runbook §1 with `--questions scripts/local-llm-bakeoff/sample-questions.json` and `--out-dir "$BAKEOFF_DATA_DIR/sample"` (a separate recorder log too). Expected: 5 items written to `sample/fixture.json` and 5 `ok: true` reference rows. Open the fixture and check that the system message contains the retrieved context and the last message is the question. If `record-fixture` reports the answer did not come from the recorder, the model allowlist is substituting a cloud model — stop and resolve that with Jack; do not edit the production allowlist to work around it.
- [ ] **Step 4: Record the real set.** Run runbook §1 with the private questions. Expected: one fixture item and one reference row per question.

### Task 12: Short rehearsal on the host

- [ ] **Step 1: Get a nod from the other consumer's owner** for a ~5-minute model reload during the day.
- [ ] **Step 2: Stage and run one variant with the sample fixture** recorded in Task 11 Step 3:

```bash
scp scripts/local-llm-bakeoff/*.mjs scripts/local-llm-bakeoff/manifest.json "$BAKEOFF_HOST:$BAKEOFF_HOST_DIR/"
scp "$BAKEOFF_DATA_DIR/sample/fixture.json" "$BAKEOFF_HOST:$BAKEOFF_HOST_DIR/sample-fixture.json"
ssh "$BAKEOFF_HOST" "cd $BAKEOFF_HOST_DIR && $BAKEOFF_NODE run-bakeoff.mjs --mode run --manifest manifest.json --fixture sample-fixture.json --out rehearsal.jsonl --state rehearsal-state.json --reps 1 --only qwen3-32b-4bit"
```

Expected: log lines for snapshot, load, request extras, done, "restored"; `rehearsal.jsonl` holds probe, baseline, concurrent and memory rows with `ok: true`; and `curl -s localhost:1234/api/v1/models` on the host shows the originally loaded model back at its original context length. Any failure here is fixed before scheduling the night.

### Task 13: Overnight run (A2)

- [ ] **Step 1: Stage** the real `fixture.json` and the final manifest (runbook §2) and rerun preflight: `"missing": []`.
- [ ] **Step 2: Schedule** with the Task 10 start time (runbook §3).
- [ ] **Step 3: Confirm it is waiting:** `ssh "$BAKEOFF_HOST" "tail -2 $BAKEOFF_HOST_DIR/run.log"` shows `waiting … min until HH:MM`.

### Task 14: Morning — score, review, report, gate

- [ ] **Step 1: Check the run finished.** `run.log` ends with `restored` and `done`, and the host's loaded model matches `state.json`. If not, restore (runbook §3) and resume the run in the next window.
- [ ] **Step 2: Copy results back and estimate judge cost** (runbook §4, without `--yes`). Present the estimate and wait for approval, then rerun with `--yes`.
- [ ] **Step 3: Review flagged items.** For every row with `grounded: false`, read the fixture input and the answer, then write `{ "variant", "itemId", "confirmedUngrounded" }` into `reviews.json`. Also blind-review about ten random answers across variants, and record any disagreement with the judge in the report notes.
- [ ] **Step 4: Render the report** (runbook §4) and read the gate column.
- [ ] **Step 5: Decide.**
  - **At least one variant passes:** if the winner is a MoE model, schedule one more night for its 8-bit variant (add a manifest entry, `--only <id>`). Then Phase A3 gets its own plan.
  - **None passes:** record the result and stop. No app code changes follow.
- [ ] **Step 6: Record aggregates in the spec.** Append a "Bake-off results (YYYY-MM-DD)" section to the spec with the per-variant table from the report — aggregates only, no question text — and the decision. Commit.
