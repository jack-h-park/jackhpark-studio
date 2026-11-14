import assert from "node:assert/strict";
import test from "node:test";

import { build } from "esbuild";

void test("the runtime header adapter uses second-based TTL and invalidates its tagged entries explicitly", async (t) => {
  const symbol = Symbol.for("@vercel/request-context");
  const globals = globalThis as Record<symbol, unknown>;
  const previous = globals[symbol];
  globals[symbol] = { get: () => ({ purge: {} }) };
  t.after(() => {
    if (previous === undefined) delete globals[symbol];
    else globals[symbol] = previous;
  });
  const result = await build({
    entryPoints: ["lib/server/notion-header-store.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    banner: {
      js: "const fixture={value:null,options:null,tags:[],fail:false};",
    },
    footer: { js: "export {fixture};" },
    plugins: [
      {
        name: "platform-boundary",
        setup(b) {
          b.onResolve({ filter: /^@vercel\/functions$/ }, (a) => ({
            path: a.path,
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents: `
        export function getCache(){return {async get(){return fixture.value;},async set(key,value,options){fixture.value=value;fixture.options=options;}};}
        export async function invalidateByTag(tag){if(fixture.fail)throw new Error('purge failed');fixture.tags.push(tag);fixture.value=null;}
      `,
          }));
        },
      },
    ],
  });
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  )) as {
    createRuntimeHeaderStore(): {
      get(key: string): Promise<unknown>;
      set(key: string, value: unknown, ttl?: number): Promise<unknown>;
      invalidate(): Promise<void>;
    };
    fixture: {
      options: { ttl: number; tags: string[] };
      tags: string[];
      fail: boolean;
    };
  };
  const store = module.createRuntimeHeaderStore();
  await store.set("header", { title: "Fresh" }, 3_600_000);
  assert.deepEqual(await store.get("header"), { title: "Fresh" });
  assert.equal(module.fixture.options.ttl, 3600);
  assert.equal(module.fixture.options.tags.length, 1);
  await store.invalidate();
  assert.deepEqual(module.fixture.tags, module.fixture.options.tags);
  assert.equal(await store.get("header"), null);
  module.fixture.fail = true;
  await assert.rejects(store.invalidate(), /purge failed/);
});

void test("missing platform purge context cannot silently report a successful invalidation", async () => {
  const { createRuntimeHeaderStore } =
    await import("../lib/server/notion-header-store");
  await assert.rejects(
    createRuntimeHeaderStore().invalidate!(),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /purge context unavailable/);
      assert.equal(
        (error as Error & { code?: string }).code,
        "purge_context_unavailable",
      );
      return true;
    },
  );
});
