import assert from "node:assert/strict";
import test from "node:test";

import type { ExtendedRecordMap } from "notion-types";
import { parsePageId } from "notion-utils";

import { rootNotionPageId } from "@/lib/config";
import { createNotionNavigationHeaderLoader } from "@/lib/server/notion-header";

const rootId = parsePageId(rootNotionPageId, { uuid: true })!;
function rootMap(title: string) {
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
function payloadCache() {
  const entries = new Map<string, unknown>();
  return {
    entries,
    get: async (key: string) => entries.get(key),
    set: async (key: string, value: unknown) => {
      entries.set(key, value);
    },
    invalidate: async () => {
      entries.clear();
    },
  };
}
function revisions() {
  const rows = new Map<string, unknown>();
  return {
    rows,
    get: async (key: string) => rows.get(key),
    set: async (key: string, value: string) => {
      rows.set(key, value);
    },
    initialize: async (key: string, value: string) => {
      if (!rows.has(key)) rows.set(key, value);
      return rows.get(key);
    },
    diagnostics: () => ({
      backend: "supabase-primary" as const,
      invalidation: "durable-revision" as const,
    }),
  };
}

void test("one region's successful refresh cannot leave another region serving a stale generation", async () => {
  let title = "Old";
  const shared = revisions();
  const east = createNotionNavigationHeaderLoader({
    now: () => 0,
    fetchRoot: async () => rootMap(title),
    store: payloadCache(),
    revisionStore: shared,
  });
  const west = createNotionNavigationHeaderLoader({
    now: () => 0,
    fetchRoot: async () => rootMap(title),
    store: payloadCache(),
    revisionStore: shared,
  });
  assert.match(JSON.stringify(await east()), /Old/);
  assert.match(JSON.stringify(await west()), /Old/);
  title = "Fresh";
  await east.invalidate();
  assert.match(JSON.stringify(await west()), /Fresh/);
});

void test("lost Runtime Cache writes cannot prevent durable marker retention", async () => {
  const shared = revisions();
  const loader = createNotionNavigationHeaderLoader({
    now: () => 0,
    fetchRoot: async () => rootMap("Fresh"),
    store: { get: async () => null, set: async () => {} },
    revisionStore: shared,
    wait: async () => {},
  });
  const result = await loader.invalidate();
  assert.equal(result?.attempts, 1);
  assert.deepEqual(result?.store, {
    backend: "supabase-primary",
    invalidation: "durable-revision",
  });
  assert.equal(shared.rows.size, 1);
  assert.match(JSON.stringify(await loader()), /Fresh/);
});

void test("durable refresh does not expire the payload tag that used to own the marker", async () => {
  const cache = payloadCache();
  cache.invalidate = async () => {
    throw new Error("must not purge authoritative state");
  };
  const loader = createNotionNavigationHeaderLoader({
    now: () => 0,
    fetchRoot: async () => rootMap("Fresh"),
    store: cache,
    revisionStore: revisions(),
  });
  await loader.invalidate();
  await loader();
  assert.ok(
    [...cache.entries.keys()].every((key) => !key.endsWith(":revision")),
  );
  assert.ok(
    [...cache.entries.keys()].every((key) =>
      key.startsWith("notion-header:v2:"),
    ),
  );
});

void test("cached headers retain an absolute one-hour lifetime without locally caching the authority", async () => {
  let now = 0;
  let calls = 0;
  let markerReads = 0;
  const shared = revisions();
  const read = shared.get;
  shared.get = async (key) => {
    markerReads++;
    return read(key);
  };
  const loader = createNotionNavigationHeaderLoader({
    now: () => now,
    fetchRoot: async () => rootMap(`Version ${++calls}`),
    store: payloadCache(),
    revisionStore: shared,
  });
  await loader();
  markerReads = 0;
  await loader();
  assert.equal(calls, 1);
  assert.equal(markerReads, 2);
  now = 3_600_001;
  assert.match(JSON.stringify(await loader()), /Version 2/);
  assert.equal(calls, 2);
});

void test("deleting a durable row creates a new generation rather than resurrecting an older payload", async () => {
  let title = "Old";
  const shared = revisions();
  const cache = payloadCache();
  const loader = createNotionNavigationHeaderLoader({
    now: () => 0,
    fetchRoot: async () => rootMap(title),
    store: cache,
    revisionStore: shared,
  });
  await loader();
  const first = [...shared.rows.values()][0];
  shared.rows.clear();
  title = "Fresh";
  assert.match(JSON.stringify(await loader()), /Fresh/);
  assert.notEqual([...shared.rows.values()][0], first);
});

void test("an unavailable authority coalesces pending origin work and marks fallback headers no-store", async (t) => {
  let release!: () => void;
  const paused = new Promise<void>((r) => {
    release = r;
  });
  t.after(() => release());
  let calls = 0;
  const shared = revisions();
  shared.get = async () => {
    throw new Error("offline primary");
  };
  const loader = createNotionNavigationHeaderLoader({
    now: () => 0,
    fetchRoot: async () => {
      calls++;
      await paused;
      return rootMap("Fresh");
    },
    store: payloadCache(),
    revisionStore: shared,
  });
  const pending = Array.from({ length: 10 }, () => loader());
  await new Promise<void>((r) => setImmediate(r));
  assert.equal(calls, 1);
  release();
  for (const header of await Promise.all(pending))
    assert.equal(header.cacheable, false);
  await assert.rejects(loader.invalidate(), { code: "revision_read_failed" });
});

void test("a silently lost durable replacement remains an explicit manual refresh failure", async () => {
  const shared = revisions();
  const loader = createNotionNavigationHeaderLoader({
    now: () => 0,
    fetchRoot: async () => rootMap("Old"),
    store: payloadCache(),
    revisionStore: shared,
    wait: async () => {},
  });
  await loader();
  shared.set = async () => {};
  await assert.rejects(loader.invalidate(), { code: "revision_not_retained" });
});

void test("a late fill from another instance cannot survive a durable generation change", async (t) => {
  let release!: () => void;
  let entered!: () => void;
  const pause = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    entered = r;
  });
  t.after(() => release());
  let first = true;
  const fetchRoot = async () => {
    if (first) {
      first = false;
      entered();
      await pause;
      return rootMap("Old");
    }
    return rootMap("Fresh");
  };
  const shared = revisions();
  const cache = payloadCache();
  const old = createNotionNavigationHeaderLoader({
    now: () => 0,
    fetchRoot,
    store: cache,
    revisionStore: shared,
  });
  const writer = createNotionNavigationHeaderLoader({
    now: () => 0,
    fetchRoot,
    store: cache,
    revisionStore: shared,
  });
  const pending = old();
  await started;
  await writer.invalidate();
  assert.match(JSON.stringify(await writer()), /Fresh/);
  release();
  assert.match(JSON.stringify(await pending), /Fresh/);
});

void test("a cold initializer cannot overwrite a concurrent manual refresh", async () => {
  const shared = revisions();
  const original = shared.initialize;
  shared.initialize = async (key, candidate) => {
    shared.rows.set(key, "manual-generation");
    return original(key, candidate);
  };
  const loader = createNotionNavigationHeaderLoader({
    now: () => 0,
    fetchRoot: async () => rootMap("Fresh"),
    store: payloadCache(),
    revisionStore: shared,
  });
  await loader();
  assert.equal([...shared.rows.values()][0], "manual-generation");
});

void test("the primary marker cannot be enabled without a payload store", () => {
  assert.throws(
    () =>
      createNotionNavigationHeaderLoader({
        now: () => 0,
        fetchRoot: async () => rootMap("Fresh"),
        revisionStore: revisions(),
      }),
    /requires a payload store/,
  );
});
