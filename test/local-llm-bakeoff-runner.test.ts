// test/local-llm-bakeoff-runner.test.ts
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readJsonl } from "@/scripts/local-llm-bakeoff/results-store.mjs";
import {
  BACKGROUND_PROMPT,
  msUntil,
  restoreFromStateFile,
  runBakeoff,
} from "@/scripts/local-llm-bakeoff/run-bakeoff.mjs";

function sendJson(res: ServerResponse, payload: unknown) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

interface FakeOptions {
  /** Chat requests whose last message equals this get HTTP 500. */
  failContent?: string;
  /** Every foreground chat request gets HTTP 500 (a server outage). */
  failAllChat?: boolean;
  /** Chat requests whose last message equals this never finish streaming. */
  stallContent?: string;
  /** Called when a stalled request arrives, before it is left hanging. */
  onStall?: () => void;
  /** Background (concurrency-pass) generations get HTTP 500. */
  failBackground?: boolean;
  /** Loading this model key answers HTTP 500. */
  failLoadKey?: string;
  /** Loading this model key never answers. */
  stallLoadKey?: string;
  /** Called when a stalled load arrives, before it is left hanging. */
  onStallLoad?: () => void;
  /** Models loaded when the server starts (default: model-a at 16_384). */
  initiallyLoaded?: [string, number | null][];
}

async function startFakeLmStudio(options: FakeOptions = {}) {
  const loaded = new Map<string, number | null>(
    options.initiallyLoaded ?? [["model-a", 16_384]],
  );
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
      if (body.model === options.stallLoadKey) {
        options.onStallLoad?.();
        return; // never answers; only an abort ends the request
      }
      if (body.model === options.failLoadKey) {
        res.writeHead(500);
        return res.end("load boom");
      }
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
      if (
        content === options.failContent ||
        (options.failAllChat && content !== BACKGROUND_PROMPT) ||
        (options.failBackground && content === BACKGROUND_PROMPT)
      ) {
        res.writeHead(500);
        return res.end("boom");
      }
      if (content === options.stallContent) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.flushHeaders();
        options.onStall?.();
        return; // never ends; the runner's request timeout must cut it off
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

const GIB = 1024 ** 3;

/** A host with plenty of memory and no swap growth, so tests never read the real machine. */
async function healthyHeadroom() {
  return { freeInactiveBytes: 30 * GIB, swapUsedBytes: 3 * GIB };
}

void test("probes, measures both passes, records memory and restores the snapshot", async () => {
  const fake = await startFakeLmStudio();
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  const lines: string[] = [];
  try {
    await runBakeoff({
      baseUrl: fake.baseUrl,
      variants,
      items,
      resultsPath: join(dir, "results.jsonl"),
      statePath: join(dir, "state.json"),
      reps: 2,
      readMemory: async () => 1000,
      readHeadroom: healthyHeadroom,
      log: (line: string) => lines.push(line),
    });
    assert.equal(lines.at(-1), "incomplete variants: none");
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
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("records a failed item, keeps going, and a rerun repeats nothing", async () => {
  const fake = await startFakeLmStudio({ failContent: "second question" });
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  const options = {
    baseUrl: fake.baseUrl,
    variants,
    items,
    resultsPath: join(dir, "results.jsonl"),
    statePath: join(dir, "state.json"),
    reps: 1,
    readMemory: async () => 1000,
    readHeadroom: healthyHeadroom,
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
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
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

const snapshotA = [
  { modelKey: "model-a", instanceId: "model-a", contextLength: 16_384 },
];

async function rowsOrEmpty(path: string) {
  try {
    return await readJsonl(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

function baseOptions(
  fake: { baseUrl: string },
  dir: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    baseUrl: fake.baseUrl,
    variants,
    items,
    resultsPath: join(dir, "results.jsonl"),
    statePath: join(dir, "state.json"),
    reps: 1,
    readMemory: async () => 1000,
    readHeadroom: healthyHeadroom,
    log: () => {},
    ...overrides,
  };
}

void test("an unrestored state file is reused instead of overwritten", async () => {
  const fake = await startFakeLmStudio({
    initiallyLoaded: [["model-b", null]],
  });
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  try {
    const takenAt = "2026-10-01T00:00:00.000Z";
    await writeFile(
      join(dir, "state.json"),
      JSON.stringify({ takenAt, snapshot: snapshotA }),
    );
    await runBakeoff(baseOptions(fake, dir));
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
    const state = JSON.parse(
      await readFile(join(dir, "state.json"), "utf8"),
    ) as { takenAt: string; snapshot: unknown; restoredAt: unknown };
    assert.equal(state.takenAt, takenAt);
    assert.deepEqual(state.snapshot, snapshotA);
    assert.equal(typeof state.restoredAt, "string");
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("a restored state file is replaced by a fresh snapshot", async () => {
  const fake = await startFakeLmStudio({
    initiallyLoaded: [["model-b", null]],
  });
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  try {
    await writeFile(
      join(dir, "state.json"),
      JSON.stringify({
        takenAt: "2026-10-01T00:00:00.000Z",
        snapshot: snapshotA,
        restoredAt: "2026-10-01T01:00:00.000Z",
      }),
    );
    await runBakeoff(baseOptions(fake, dir));
    assert.deepEqual([...fake.loaded.entries()], [["model-b", null]]);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("a load failure still restores the snapshot", async () => {
  const fake = await startFakeLmStudio({ failLoadKey: "model-bad" });
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  try {
    await runBakeoff(
      baseOptions(fake, dir, {
        variants: [{ ...variants[0], id: "bad", key: "model-bad" }],
      }),
    );
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
    const rows = await rowsOrEmpty(join(dir, "results.jsonl"));
    assert.equal(rows.length, 0);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("an outage streak is not recorded as results", async () => {
  const fake = await startFakeLmStudio({ failAllChat: true });
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  try {
    const four = [...items, item("q3", "third"), item("q4", "fourth")];
    const options = baseOptions(fake, dir, {
      variants: [{ ...variants[0], thinkingCandidates: undefined }],
      items: four,
    });
    const lines: string[] = [];
    await runBakeoff({ ...options, log: (line: string) => lines.push(line) });
    assert.ok(
      lines.some((l) => l.includes("server unhealthy: 3 consecutive failures")),
    );
    assert.equal(lines.at(-1), "incomplete variants: b-4bit");
    const rows = await rowsOrEmpty(join(dir, "results.jsonl"));
    assert.equal(rows.filter((r) => r.pass === "baseline").length, 0);
    assert.equal(rows.filter((r) => r.pass === "memory").length, 0);
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("failures before a success are recorded in order", async () => {
  const fake = await startFakeLmStudio({ failContent: "first question" });
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  try {
    await runBakeoff(
      baseOptions(fake, dir, {
        variants: [{ ...variants[0], thinkingCandidates: undefined }],
      }),
    );
    const baseline = (await readJsonl(join(dir, "results.jsonl"))).filter(
      (r) => r.pass === "baseline",
    );
    assert.deepEqual(
      baseline.map((r) => [r.itemId, r.ok]),
      [
        ["q1", false],
        ["q2", true],
      ],
    );
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("a stalled stream times out, is recorded as failed, and the run restores", async () => {
  const fake = await startFakeLmStudio({ stallContent: "second question" });
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  try {
    await runBakeoff(
      baseOptions(fake, dir, {
        variants: [{ ...variants[0], thinkingCandidates: undefined }],
        requestTimeoutMs: 200,
      }),
    );
    const rows = await readJsonl(join(dir, "results.jsonl"));
    const stalled = rows.find(
      (r) => r.itemId === "q2" && r.pass === "baseline",
    );
    assert.equal(stalled?.ok, false);
    assert.match(String(stalled?.error), /timeout|aborted/i);
    assert.equal(rows.filter((r) => r.pass === "memory").length, 1);
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("a run abort leaves the in-flight item unwritten", async () => {
  // The abort is triggered by the stalled request arriving, not by a timer, so
  // it always lands while q2 is in flight and after q1 has been written.
  const controller = new AbortController();
  const fake = await startFakeLmStudio({
    stallContent: "second question",
    onStall: () => controller.abort(),
  });
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  try {
    await runBakeoff(
      baseOptions(fake, dir, {
        variants: [{ ...variants[0], thinkingCandidates: undefined }],
        signal: controller.signal,
      }),
    );
    const rows = await readJsonl(join(dir, "results.jsonl"));
    assert.ok(rows.some((r) => r.itemId === "q1" && r.pass === "baseline"));
    assert.equal(
      rows.some((r) => r.itemId === "q2"),
      false,
    );
    assert.equal(rows.filter((r) => r.pass === "memory").length, 0);
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("background stream outcomes are counted in the memory row", async () => {
  const fake = await startFakeLmStudio({ failBackground: true });
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  try {
    await runBakeoff(baseOptions(fake, dir));
    const memory = (await readJsonl(join(dir, "results.jsonl"))).find(
      (r) => r.pass === "memory",
    ) as { background: { ok: number; failed: number; lastError: string } };
    assert.equal(memory.background.ok, 0);
    assert.ok(memory.background.failed >= 1);
    assert.match(memory.background.lastError, /HTTP 500/);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("probe rows carry startedAt and the candidate merged over requestExtras", async () => {
  const fake = await startFakeLmStudio();
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  try {
    await runBakeoff(
      baseOptions(fake, dir, {
        variants: [{ ...variants[0], requestExtras: { top_p: 0.9 } }],
      }),
    );
    const probes = (await readJsonl(join(dir, "results.jsonl"))).filter(
      (r) => r.pass === "probe",
    );
    assert.ok(probes.every((r) => typeof r.startedAt === "string"));
    assert.deepEqual(probes[1]?.extras, {
      top_p: 0.9,
      chat_template_kwargs: { enable_thinking: false },
    });
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("runBakeoff rejects empty items and a non-positive reps", async () => {
  const fake = await startFakeLmStudio();
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  try {
    await assert.rejects(
      runBakeoff(baseOptions(fake, dir, { items: [] })),
      /no items/,
    );
    await assert.rejects(
      runBakeoff(baseOptions(fake, dir, { reps: 0 })),
      /positive integer/,
    );
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("msUntil rejects an hour or minute out of range", () => {
  const from = new Date(2026, 8, 26, 23, 0, 0);
  assert.throws(() => msUntil("24:00", from), /HH:MM/);
  assert.throws(() => msUntil("12:60", from), /HH:MM/);
});

void test("restoreFromStateFile restores, stamps restoredAt, and the next run snapshots fresh", async () => {
  const fake = await startFakeLmStudio({
    initiallyLoaded: [["model-b", null]],
  });
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  const statePath = join(dir, "state.json");
  try {
    const takenAt = "2026-10-01T00:00:00.000Z";
    await writeFile(
      statePath,
      JSON.stringify({ takenAt, snapshot: snapshotA }),
    );
    await restoreFromStateFile({ baseUrl: fake.baseUrl }, statePath);
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      takenAt: string;
      snapshot: unknown;
      restoredAt: unknown;
    };
    assert.equal(state.takenAt, takenAt);
    assert.deepEqual(state.snapshot, snapshotA);
    assert.equal(typeof state.restoredAt, "string");

    // Something else is loaded by the next night; the run must not evict it.
    fake.loaded.clear();
    fake.loaded.set("model-c", null);
    await runBakeoff(baseOptions(fake, dir));
    assert.deepEqual([...fake.loaded.entries()], [["model-c", null]]);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("restoreFromStateFile refuses an already restored state unless forced", async () => {
  const fake = await startFakeLmStudio({
    initiallyLoaded: [["model-b", null]],
  });
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  const statePath = join(dir, "state.json");
  try {
    const takenAt = "2026-10-01T00:00:00.000Z";
    const restoredAt = "2026-10-01T06:00:00.000Z";
    await writeFile(
      statePath,
      JSON.stringify({ takenAt, snapshot: snapshotA, restoredAt }),
    );
    await assert.rejects(
      restoreFromStateFile({ baseUrl: fake.baseUrl }, statePath),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes(takenAt) &&
        error.message.includes(restoredAt) &&
        error.message.includes("--force"),
    );
    assert.deepEqual([...fake.loaded.entries()], [["model-b", null]]);
    await restoreFromStateFile({ baseUrl: fake.baseUrl }, statePath, {
      force: true,
    });
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("a run abort interrupts a model load that never answers, and the snapshot is restored", async () => {
  const controller = new AbortController();
  const fake = await startFakeLmStudio({
    stallLoadKey: "model-b",
    onStallLoad: () => controller.abort(),
  });
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  const lines: string[] = [];
  try {
    await runBakeoff(
      baseOptions(fake, dir, {
        signal: controller.signal,
        log: (line: string) => lines.push(line),
      }),
    );
    assert.ok(lines.some((l) => l.startsWith("[b-4bit] aborted:")));
    assert.ok(lines.includes("restored"));
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

const twoVariants = [
  { ...variants[0], thinkingCandidates: undefined },
  {
    ...variants[0],
    id: "a-second",
    key: "model-a",
    thinkingCandidates: undefined,
  },
];

void test("the run refuses to start when free+inactive memory is already under the stop line", async () => {
  const fake = await startFakeLmStudio();
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  try {
    await assert.rejects(
      runBakeoff(
        baseOptions(fake, dir, {
          readHeadroom: async () => ({
            freeInactiveBytes: 8 * GIB,
            swapUsedBytes: 0,
          }),
        }),
      ),
      /stop rule: free\+inactive 8\.0 GiB is under 12 GiB; not starting/,
    );
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
    assert.equal(fake.chatCalls.length, 0);
    assert.deepEqual(await rowsOrEmpty(join(dir, "results.jsonl")), []);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("free+inactive falling under the stop line ends the run and restores the snapshot", async () => {
  const fake = await startFakeLmStudio();
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  const lines: string[] = [];
  let reads = 0;
  try {
    // Healthy at the start and right after the first load, then memory runs low.
    await runBakeoff(
      baseOptions(fake, dir, {
        variants: twoVariants,
        readHeadroom: async () => {
          reads += 1;
          return {
            freeInactiveBytes: reads <= 2 ? 30 * GIB : 11 * GIB,
            swapUsedBytes: 3 * GIB,
          };
        },
        log: (line: string) => lines.push(line),
      }),
    );
    assert.ok(
      lines.some((line) =>
        /stop rule tripped: free\+inactive 11\.0 GiB is under 12 GiB/.test(
          line,
        ),
      ),
    );
    assert.equal(lines.at(-1), "incomplete variants: b-4bit, a-second");
    const rows = await readJsonl(join(dir, "results.jsonl"));
    assert.equal(rows.filter((r) => r.variant === "a-second").length, 0);
    assert.equal(rows.filter((r) => r.pass === "memory").length, 0);
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("swap growing by more than 1 GiB since the start ends the run", async () => {
  const fake = await startFakeLmStudio();
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-run-"));
  const lines: string[] = [];
  let reads = 0;
  try {
    await runBakeoff(
      baseOptions(fake, dir, {
        variants: twoVariants,
        readHeadroom: async () => {
          reads += 1;
          return {
            freeInactiveBytes: 30 * GIB,
            swapUsedBytes: reads <= 2 ? 3 * GIB : 4.5 * GIB,
          };
        },
        log: (line: string) => lines.push(line),
      }),
    );
    assert.ok(
      lines.some((line) =>
        /stop rule tripped: swap grew 1\.5 GiB since the run started/.test(
          line,
        ),
      ),
    );
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
  } finally {
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});
