import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import test from "node:test";

import type { ExtendedRecordMap } from "notion-types";
import { parsePageId } from "notion-utils";

import { rootNotionPageId } from "@/lib/config";
import { createNotionNavigationHeaderLoader } from "@/lib/server/notion-header";
import { createRuntimeHeaderStore } from "@/lib/server/notion-header-store";

const symbol = Symbol.for("@vercel/request-context");
type CacheOptions = { ttl?: number; tags?: string[] };
function platform() {
  const entries = new Map<
    string,
    { value: unknown; options?: CacheOptions; at: number }
  >();
  let now = 0;
  const expirations: string[] = [];
  const purges: string[] = [];
  let deferredPurge = false;
  const cache = {
    get: async (key: string) => {
      const entry = entries.get(key);
      if (entry?.options?.ttl && entry.at + entry.options.ttl * 1000 <= now)
        entries.delete(key);
      return deferredPurge ? null : (entries.get(key)?.value ?? null);
    },
    set: async (key: string, value: unknown, options?: CacheOptions) => {
      entries.set(key, { value, options, at: now });
    },
    expireTag: async (input: string | string[]) => {
      const tags = typeof input === "string" ? [input] : input;
      expirations.push(...tags);
      for (const [key, entry] of entries)
        if (entry.options?.tags?.some((tag) => tags.includes(tag)))
          entries.delete(key);
    },
  };
  return {
    entries,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
    expirations,
    purges,
    cache,
    // Model a distinct, deferred CDN purge path. This is not an assertion
    // about Vercel's internal scheduling or the historical Production cause.
    purge: {
      invalidateByTag: async (tag: string) => {
        purges.push(tag);
        deferredPurge = true;
      },
    },
  };
}
function bind(t: test.TestContext, value: unknown) {
  const globals = globalThis as Record<symbol, unknown>;
  const old = globals[symbol];
  globals[symbol] = { get: () => value };
  t.after(() => {
    if (old === undefined) delete globals[symbol];
    else globals[symbol] = old;
  });
}

void test("installed SDK expires Runtime Cache tags without invoking the independent CDN purge path", async (t) => {
  const context = platform();
  bind(t, context);
  const store = createRuntimeHeaderStore();
  const markerKey = "header:revision";
  await store.set(markerKey, "old");
  await store.set("header:old", { title: "Old" }, 3_600_000);
  const keys = [...context.entries.keys()];
  assert.ok(
    keys.includes(
      `notion-header-v1$${createHash("sha256").update(markerKey).digest("hex")}`,
    ),
  );
  const options = [...context.entries.values()].map((entry) => entry.options);
  assert.equal(options[0]?.ttl, undefined);
  assert.equal(options[1]?.ttl, 3600);
  assert.deepEqual(options[0]?.tags, options[1]?.tags);
  await store.invalidate!();
  assert.equal(await store.get(markerKey), null);
  await store.set(markerKey, "fresh");
  assert.equal(await store.get(markerKey), "fresh");
  assert.deepEqual(context.purges, []);
  assert.deepEqual(context.expirations, options[0]?.tags);
  assert.deepEqual(store.diagnostics!(), {
    backend: "request-context",
    invalidation: "runtime-expire-tag",
  });
});

void test("a Runtime Cache context does not need the unrelated CDN purge capability", async (t) => {
  const { cache, expirations } = platform();
  bind(t, { cache });
  await createRuntimeHeaderStore().invalidate!();
  assert.equal(expirations.length, 1);
});

void test("an explicit Runtime Cache expiration failure is never hidden by a successful CDN purge", async (t) => {
  const context = platform();
  context.cache.expireTag = async () => {
    throw new Error("offline expiration failure");
  };
  bind(t, context);
  await assert.rejects(
    createRuntimeHeaderStore().invalidate!(),
    /offline expiration failure/,
  );
  assert.deepEqual(context.purges, []);
});

void test("missing platform context cannot turn a local fallback into a successful invalidation", async (t) => {
  bind(t, undefined);
  await assert.rejects(createRuntimeHeaderStore().invalidate!(), {
    code: "runtime_cache_context_unavailable",
  });
});

void test("backend diagnostics follow the active request, not the last concurrent caller", async (t) => {
  const contexts = new AsyncLocalStorage<unknown>();
  const globals = globalThis as Record<symbol, unknown>;
  const old = globals[symbol];
  globals[symbol] = { get: () => contexts.getStore() };
  t.after(() => {
    if (old === undefined) delete globals[symbol];
    else globals[symbol] = old;
  });
  const store = createRuntimeHeaderStore();
  await Promise.all([
    contexts.run(platform(), async () => {
      await Promise.resolve();
      assert.equal(store.diagnostics!().backend, "request-context");
    }),
    contexts.run({ purge: {} }, async () => {
      await Promise.resolve();
      assert.equal(store.diagnostics!().backend, "sdk-fallback");
    }),
  ]);
});

const rootId = parsePageId(rootNotionPageId, { uuid: true })!;
function rootMap(title: string): ExtendedRecordMap {
  return {
    block: {
      [rootId]: {
        role: "reader",
        value: { id: rootId, type: "page", properties: { title: [[title]] } },
      },
    },
    collection: {},
    collection_view: {},
    collection_query: {},
    notion_user: {},
    signed_urls: {},
  } as unknown as ExtendedRecordMap;
}

void test("the real adapter and loader retain manual refresh generations and safe backend evidence", async (t) => {
  const context = platform();
  bind(t, context);
  let calls = 0;
  const loader = createNotionNavigationHeaderLoader({
    store: createRuntimeHeaderStore(),
    now: context.now,
    fetchRoot: async () => rootMap(++calls === 1 ? "Old" : "Fresh"),
  });
  assert.match(JSON.stringify(await loader()), /Old/);
  const verification = await loader.invalidate();
  assert.deepEqual(verification, {
    attempts: 1,
    missing: 0,
    previous: 0,
    different: 0,
    invalid: 0,
    waitedMs: 0,
    store: { backend: "request-context", invalidation: "runtime-expire-tag" },
  });
  assert.match(JSON.stringify(await loader()), /Fresh/);
  assert.equal(calls, 2);
  assert.deepEqual(context.purges, []);
});

void test("the real adapter keeps the marker while one-hour header entries expire", async (t) => {
  const context = platform();
  bind(t, context);
  let calls = 0;
  const loader = createNotionNavigationHeaderLoader({
    store: createRuntimeHeaderStore(),
    now: context.now,
    fetchRoot: async () => rootMap(`Version ${++calls}`),
  });
  await loader();
  await loader();
  assert.equal(calls, 1);
  const marker = [...context.entries.values()].find(
    (entry) => typeof entry.value === "string",
  )?.value;
  context.advance(3_600_001);
  assert.match(JSON.stringify(await loader()), /Version 2/);
  assert.equal(calls, 2);
  assert.ok(
    [...context.entries.values()].some((entry) => entry.value === marker),
  );
});

void test("a late fill on another loader cannot restore the pre-refresh header through the real adapter", async (t) => {
  const context = platform();
  bind(t, context);
  let release!: () => void;
  let started!: () => void;
  const paused = new Promise<void>((r) => {
    release = r;
  });
  const entered = new Promise<void>((r) => {
    started = r;
  });
  t.after(() => release());
  let first = true;
  const fetchRoot = async () => {
    if (first) {
      first = false;
      started();
      await paused;
      return rootMap("Old");
    }
    return rootMap("Fresh");
  };
  const old = createNotionNavigationHeaderLoader({
    store: createRuntimeHeaderStore(),
    now: context.now,
    fetchRoot,
  });
  const writer = createNotionNavigationHeaderLoader({
    store: createRuntimeHeaderStore(),
    now: context.now,
    fetchRoot,
  });
  const pending = old();
  await entered;
  await writer.invalidate();
  assert.match(JSON.stringify(await writer()), /Fresh/);
  release();
  assert.match(JSON.stringify(await pending), /Fresh/);
  assert.match(JSON.stringify(await old()), /Fresh/);
});

void test("a purge-only context cannot report a shared refresh through the SDK's local-memory fallback", async (t) => {
  bind(t, { purge: { invalidateByTag: async () => {} } });
  const old = process.env.RUNTIME_CACHE_DISABLE_BUILD_CACHE;
  process.env.RUNTIME_CACHE_DISABLE_BUILD_CACHE = "true";
  t.after(() => {
    if (old === undefined) delete process.env.RUNTIME_CACHE_DISABLE_BUILD_CACHE;
    else process.env.RUNTIME_CACHE_DISABLE_BUILD_CACHE = old;
  });
  const store = createRuntimeHeaderStore();
  // The actual SDK can retain this in one process. That is not shared-cache proof.
  await store.set("offline-memory-marker", "local-only");
  assert.equal(await store.get("offline-memory-marker"), "local-only");
  assert.equal(store.diagnostics!().backend, "sdk-fallback");
  await assert.rejects(store.invalidate!(), {
    code: "runtime_cache_context_unavailable",
  });
});

void test("an incomplete cache capability cannot start a manual invalidation", async (t) => {
  bind(t, { cache: {}, purge: {} });
  await assert.rejects(createRuntimeHeaderStore().invalidate!(), {
    code: "runtime_cache_context_unavailable",
  });
});
