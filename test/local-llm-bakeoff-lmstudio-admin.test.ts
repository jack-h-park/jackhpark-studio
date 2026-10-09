import assert from "node:assert/strict";
import test from "node:test";

import { createLmStudioAdmin } from "@/scripts/local-llm-bakeoff/lmstudio-admin.mjs";

type Call = {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
};

function fakeLmStudio(
  initial: Record<string, number | null>,
  /** Model key -> how many load attempts answer HTTP 500 before one succeeds. */
  failLoads: Record<string, number> = {},
) {
  const remainingFailures = new Map(Object.entries(failLoads));
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
      const key = String(body?.model);
      const failures = remainingFailures.get(key) ?? 0;
      if (failures > 0) {
        remainingFailures.set(key, failures - 1);
        return new Response(`cannot load ${key}`, { status: 500 });
      }
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
  const fake = fakeLmStudio({ "model-a": 16_384, embed: null });
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: fake.fetchImpl,
  });
  assert.deepEqual(await admin.loadedLlmInstances(), [
    {
      modelKey: "model-a",
      instanceId: "model-a",
      contextLength: 16_384,
      loadConfig: { context_length: 16_384 },
    },
  ]);
});

void test("restore unloads what is loaded and reloads the snapshot with its context length", async () => {
  const fake = fakeLmStudio({ "model-a": 16_384 });
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: fake.fetchImpl,
  });
  const snapshot = await admin.loadedLlmInstances();
  await admin.unloadAllLlms();
  await admin.load("model-b", { context_length: 8192 });
  await admin.restore(snapshot);
  assert.deepEqual([...fake.loaded.entries()], [["model-a", 16_384]]);
  // The last call is restore's read-back; the last load is the snapshot's.
  assert.deepEqual(
    fake.calls.findLast((c) => c.path === "/api/v1/models/load")?.body,
    { model: "model-a", context_length: 16_384, echo_load_config: true },
  );
});

void test("a non-2xx response throws with status and body", async () => {
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: async () => new Response("boom", { status: 500 }),
  });
  await assert.rejects(admin.load("x"), /HTTP 500 boom/);
});

void test("restore tries every snapshot instance and names each one that failed twice", async () => {
  const fake = fakeLmStudio({}, { "model-a": 2, "model-b": 1 });
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: fake.fetchImpl,
    restoreRetryDelayMs: 0,
  });
  await assert.rejects(
    admin.restore([
      { modelKey: "model-a", instanceId: "model-a", contextLength: 4096 },
      { modelKey: "model-b", instanceId: "model-b", contextLength: 8192 },
    ]),
    (error: unknown) =>
      error instanceof AggregateError &&
      /model-a/.test(error.message) &&
      !/model-b/.test(error.message) &&
      error.errors.length === 1,
  );
  // model-b failed once, was retried, and is loaded despite model-a failing.
  assert.deepEqual([...fake.loaded.entries()], [["model-b", 8192]]);
  assert.equal(
    fake.calls.filter((c) => c.path === "/api/v1/models/load").length,
    4,
  );
});

void test("an unload failure in restore throws before anything is loaded", async () => {
  const fake = fakeLmStudio({ "model-a": null });
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: async (input, init) =>
      new URL(String(input)).pathname === "/api/v1/models/unload"
        ? new Response("busy", { status: 500 })
        : fake.fetchImpl(input, init),
    restoreRetryDelayMs: 0,
  });
  await assert.rejects(
    admin.restore([
      { modelKey: "model-b", instanceId: "model-b", contextLength: null },
    ]),
    /unload failed: HTTP 500 busy/,
  );
  assert.equal(
    fake.calls.some((c) => c.path === "/api/v1/models/load"),
    false,
  );
});

/**
 * A server that accepts the request and never answers until aborted. It holds
 * a ref'd handle the way a real open socket does: `AbortSignal.timeout` timers
 * are unref'd, so without one the event loop can drain before the timeout
 * fires and node:test cancels the test.
 */
async function neverAnswers(
  _input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    const openSocket = setInterval(() => {}, 1000);
    init?.signal?.addEventListener("abort", () => {
      clearInterval(openSocket);
      reject(init.signal?.reason);
    });
  });
}

function hangingFetch(): typeof fetch {
  return neverAnswers;
}

void test("a load that never answers rejects after the load timeout", async () => {
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: hangingFetch(),
    timeouts: { loadMs: 30, otherMs: 60_000 },
  });
  const startedAt = performance.now();
  await assert.rejects(
    admin.load("model-a"),
    /POST \/api\/v1\/models\/load timed out after 30 ms/,
  );
  assert.ok(performance.now() - startedAt < 5000);
});

void test("other admin calls use their own timeout, and a caller signal also stops them", async () => {
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: hangingFetch(),
    timeouts: { loadMs: 60_000, otherMs: 30 },
  });
  await assert.rejects(
    admin.listModels(),
    /GET \/api\/v1\/models timed out after 30 ms/,
  );
  const slow = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: hangingFetch(),
  });
  const controller = new AbortController();
  const pending = slow.load("model-a", {}, { signal: controller.signal });
  controller.abort(new Error("run stopped"));
  await assert.rejects(pending, /run stopped/);
});
