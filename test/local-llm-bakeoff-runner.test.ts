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
  const loaded = new Map<string, number | null>([["model-a", 16_384]]);
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
      readMemory: async () => 1000,
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
    assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
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
    readMemory: async () => 1000,
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
