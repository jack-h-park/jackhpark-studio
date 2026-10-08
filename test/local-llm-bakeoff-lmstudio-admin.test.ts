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
  const fake = fakeLmStudio({ "model-a": 16_384, embed: null });
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: fake.fetchImpl,
  });
  assert.deepEqual(await admin.loadedLlmInstances(), [
    { modelKey: "model-a", instanceId: "model-a", contextLength: 16_384 },
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
  assert.deepEqual(fake.calls.at(-1)?.body, {
    model: "model-a",
    context_length: 16_384,
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
