import assert from "node:assert/strict";
import test from "node:test";

import { createLmStudioAdmin } from "@/scripts/local-llm-bakeoff/lmstudio-admin.mjs";

type InstanceConfig = Record<string, unknown>;

/**
 * Keeps each loaded model's full instance config, like LM Studio's
 * `/api/v1/models`. `ignore` lists load keys the fake accepts but does not
 * apply, to simulate a server that silently drops a setting.
 */
function fakeServer(
  initial: Record<string, InstanceConfig>,
  ignore: string[] = [],
  /** Models that come back as two instances, as when another client loads one during the restore. */
  duplicateOnLoad: string[] = [],
) {
  const loaded = new Map<string, InstanceConfig>(Object.entries(initial));
  const duplicated = new Set<string>();
  const loadBodies: Record<string, unknown>[] = [];
  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const path = new URL(String(input)).pathname;
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : {};
    if (path === "/api/v1/models") {
      return Response.json({
        models: ["model-a", "model-b"].map((key) => ({
          key,
          type: "llm",
          loaded_instances: loaded.has(key)
            ? [
                { id: key, config: loaded.get(key) },
                ...(duplicated.has(key)
                  ? [{ id: `${key}:2`, config: loaded.get(key) }]
                  : []),
              ]
            : [],
        })),
      });
    }
    if (path === "/api/v1/models/load") {
      loadBodies.push(body);
      const { model, echo_load_config: _echo, ...settings } = body;
      const applied: InstanceConfig = { context_length: 4096, parallel: 1 };
      for (const [key, value] of Object.entries(settings)) {
        if (!ignore.includes(key)) {
          applied[key] = value;
        }
      }
      loaded.set(String(model), applied);
      if (duplicateOnLoad.includes(String(model))) {
        duplicated.add(String(model));
      }
      return Response.json({ instance_id: model, status: "loaded" });
    }
    if (path === "/api/v1/models/unload") {
      loaded.delete(String(body.instance_id));
      return Response.json({ instance_id: body.instance_id });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetchImpl, loaded, loadBodies };
}

const residentConfig = {
  context_length: 16_384,
  parallel: 2,
  reasoning_budget_message: "",
};

void test("the snapshot keeps every restorable load setting, not just the context length", async () => {
  const fake = fakeServer({
    "model-a": { ...residentConfig, some_runtime_stat: 7 },
  });
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: fake.fetchImpl,
  });
  assert.deepEqual(await admin.loadedLlmInstances(), [
    {
      modelKey: "model-a",
      instanceId: "model-a",
      contextLength: 16_384,
      loadConfig: residentConfig,
    },
  ]);
});

void test("restore reloads the resident model with its slot count and verifies it", async () => {
  const fake = fakeServer({ "model-a": residentConfig });
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: fake.fetchImpl,
    restoreRetryDelayMs: 0,
  });
  const snapshot = await admin.loadedLlmInstances();
  await admin.unloadAllLlms();
  await admin.load("model-b");
  await admin.restore(snapshot);
  assert.deepEqual([...fake.loaded.entries()], [["model-a", residentConfig]]);
  assert.deepEqual(fake.loadBodies.at(-1), {
    model: "model-a",
    ...residentConfig,
    echo_load_config: true,
  });
});

void test("restore fails loudly when the server did not apply a snapshot setting", async () => {
  const fake = fakeServer({ "model-a": residentConfig }, ["parallel"]);
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: fake.fetchImpl,
    restoreRetryDelayMs: 0,
  });
  const snapshot = await admin.loadedLlmInstances();
  await assert.rejects(
    admin.restore(snapshot),
    /model-a loaded with parallel=1, snapshot had parallel=2/,
  );
});

void test("a snapshot written before load settings were kept still restores by context length", async () => {
  const fake = fakeServer({});
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: fake.fetchImpl,
    restoreRetryDelayMs: 0,
  });
  await admin.restore([
    { modelKey: "model-a", instanceId: "model-a", contextLength: 8192 },
  ]);
  assert.deepEqual(fake.loadBodies.at(-1), {
    model: "model-a",
    context_length: 8192,
    echo_load_config: true,
  });
});

void test("restore fails when a snapshot model comes back as more instances than it had", async () => {
  const fake = fakeServer({ "model-a": residentConfig }, [], ["model-a"]);
  const admin = createLmStudioAdmin({
    baseUrl: "http://lm",
    fetchImpl: fake.fetchImpl,
  });
  const snapshot = await admin.loadedLlmInstances();
  await assert.rejects(
    admin.restore(snapshot),
    /model-a has 2 loaded instances, snapshot had 1/,
  );
});
