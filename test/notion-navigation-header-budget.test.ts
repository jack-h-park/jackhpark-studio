import assert from "node:assert/strict";
import test from "node:test";

import type { ExtendedRecordMap, PageBlock } from "notion-types";
import { build } from "esbuild";
import { getBlockTitle } from "notion-utils";

import { rootNotionPageId } from "@/lib/config";
import { notion } from "@/lib/notion-api";
import {
  createNotionNavigationHeaderLoader as createLoader,
  loadNotionNavigationHeader,
} from "@/lib/server/notion-header";

const rootId = `${rootNotionPageId.slice(0, 8)}-${rootNotionPageId.slice(8, 12)}-${rootNotionPageId.slice(12, 16)}-${rootNotionPageId.slice(16, 20)}-${rootNotionPageId.slice(20)}`;
const compactRootId = rootId.replaceAll("-", "");
const emptyMap: ExtendedRecordMap = {
  block: {},
  collection: {},
  collection_query: {},
  collection_view: {},
  notion_user: {},
  signed_urls: {},
};
const rootBlock: PageBlock = {
  id: rootId,
  type: "page",
  version: 1,
  properties: { title: [["Navigation root"]] },
  content: [],
  created_time: 1,
  last_edited_time: 1,
  parent_id: "space",
  parent_table: "space",
  alive: true,
  format: {},
  permissions: [{ role: "reader", type: "public_permission" }],
  created_by_table: "notion_user",
  created_by_id: "author",
  last_edited_by_table: "notion_user",
  last_edited_by_id: "author",
};
const rootMap: ExtendedRecordMap = {
  ...emptyMap,
  block: { [rootId]: { role: "reader", value: rootBlock } },
};

void test("repeated header reads reuse one successful root fetch for an hour", async () => {
  let reads = 0;
  let clock = 0;
  const load = createLoader({
    fetchRoot: async (pageId) => {
      assert.equal(pageId, rootId);
      reads++;
      return rootMap;
    },
    now: () => clock,
  });
  assert.equal((await load()).headerBlockId, rootId);
  clock = 3_599_999;
  assert.equal(
    (await load()).headerRecordMap?.block[rootId].value.properties
      ?.title?.[0][0],
    "Navigation root",
  );
  assert.equal(reads, 1);
});

void test("concurrent cold header reads share the root fetch already in flight", async () => {
  let reads = 0;
  let complete!: (map: ExtendedRecordMap) => void;
  const pending = new Promise<ExtendedRecordMap>((resolve) => {
    complete = resolve;
  });
  const load = createLoader({
    fetchRoot: async () => {
      reads++;
      return pending;
    },
    now: () => 0,
  });
  const first = load();
  const second = load();
  complete(rootMap);
  const results = await Promise.all([first, second]);
  assert.equal(reads, 1);
  assert.equal(results[0].headerRecordMap?.block[rootId].value.id, rootId);
  assert.deepEqual(results[1], results[0]);
});

void test("reads never slide expiry and concurrent reads at the deadline fetch one new revision", async () => {
  let reads = 0;
  let clock = 100;
  const load = createLoader({
    fetchRoot: async () => ({
      ...rootMap,
      block: {
        [rootId]: { role: "reader", value: { ...rootBlock, version: ++reads } },
      },
    }),
    now: () => clock,
  });
  await load();
  clock = 1_800_100;
  await load();
  clock = 3_600_099;
  await load();
  assert.equal(reads, 1);
  clock = 3_600_100;
  const results = await Promise.all([load(), load()]);
  assert.equal(reads, 2);
  assert.equal(results[0].headerRecordMap?.block[rootId].value.version, 2);
  assert.equal(results[1].headerRecordMap?.block[rootId].value.version, 2);
});

void test("a rejected root read returns a null header and recovers on the next call", async () => {
  let reads = 0;
  const load = createLoader({
    fetchRoot: async () => {
      if (++reads === 1) throw new Error("Notion unavailable");
      return rootMap;
    },
    now: () => 0,
  });
  const failures = await Promise.all([load(), load()]);
  assert.deepEqual(failures, [
    { headerRecordMap: null, headerBlockId: rootId },
    { headerRecordMap: null, headerBlockId: rootId },
  ]);
  assert.ok((await load()).headerRecordMap);
  assert.equal(reads, 2);
});

void test("a response without the root block is not cached", async () => {
  let reads = 0;
  const load = createLoader({
    fetchRoot: async () => (++reads === 1 ? emptyMap : rootMap),
    now: () => 0,
  });
  assert.deepEqual(await load(), {
    headerRecordMap: null,
    headerBlockId: rootId,
  });
  assert.ok((await load()).headerRecordMap);
  assert.equal(reads, 2);
});

void test("the header unwraps compact root entries and drops all unrelated records and signed URLs", async () => {
  const nestedRoot = {
    role: "reader",
    value: { role: "reader", value: rootBlock },
  } as unknown as ExtendedRecordMap["block"][string];
  const input: ExtendedRecordMap = {
    ...rootMap,
    block: {
      [compactRootId]: nestedRoot,
      child: { role: "reader", value: { ...rootBlock, id: "child" } },
    },
    collection: {
      private: {
        role: "reader",
        value: {
          id: "private",
          version: 1,
          name: [["Private collection"]],
          schema: {},
          icon: "",
          parent_id: rootId,
          parent_table: "block",
          alive: true,
          copied_from: "",
        },
      },
    },
    collection_query: { private: {} },
    collection_view: {
      private: {
        role: "reader",
        value: {
          id: "private",
          type: "table",
          name: "Private view",
          version: 1,
          alive: true,
          parent_id: rootId,
          parent_table: "block",
          query2: { group_by: "title" },
          format: { table_wrap: false, table_properties: [] },
          page_sort: [],
        },
      },
    },
    notion_user: {
      private: {
        role: "reader",
        value: {
          id: "private",
          version: 1,
          email: "private@example.invalid",
          given_name: "Private",
          family_name: "User",
          profile_photo: "",
          onboarding_completed: true,
          mobile_onboarding_completed: false,
        },
      },
    },
    signed_urls: { private: "https://example.invalid/signed-secret" },
  };
  const load = createLoader({ fetchRoot: async () => input, now: () => 0 });
  const result = await load();
  assert.deepEqual(result, {
    headerBlockId: rootId,
    headerRecordMap: {
      ...emptyMap,
      block: {
        [rootId]: { role: "reader", value: rootBlock },
        [compactRootId]: { role: "reader", value: rootBlock },
      },
    },
  });
  assert.equal(
    getBlockTitle(
      result.headerRecordMap!.block[rootId].value,
      result.headerRecordMap!,
    ),
    "Navigation root",
  );
  assert.deepEqual(input.block[compactRootId], nestedRoot);
});

void test("a root entry without an id keeps the canonical header id", async () => {
  const { id: _id, ...value } = rootBlock;
  const map = {
    ...rootMap,
    block: { [rootId]: { role: "reader", value } },
  } as ExtendedRecordMap;
  const load = createLoader({ fetchRoot: async () => map, now: () => 0 });
  assert.equal((await load()).headerRecordMap?.block[rootId].value.id, rootId);
});

void test("rate-limited root reads use the existing retry budget", async (t) => {
  const delays: number[] = [];
  const originalSetTimeout = globalThis.setTimeout;
  t.mock.method(
    globalThis,
    "setTimeout",
    (callback: () => void, delay: number) => {
      delays.push(delay);
      callback();
      return originalSetTimeout(() => {}, 0);
    },
  );
  let reads = 0;
  const load = createLoader({
    fetchRoot: async () => {
      if (++reads < 5) throw new Error("429 Too Many Requests");
      return rootMap;
    },
    now: () => 0,
  });
  assert.ok((await load()).headerRecordMap);
  assert.equal(reads, 5);
  assert.deepEqual(delays, [2000, 4000, 8000, 16_000]);
});

void test("the default loader fetches a single root chunk with all hydration disabled", async (t) => {
  const calls: Parameters<typeof notion.getPage>[] = [];
  t.mock.method(
    notion,
    "getPage",
    async (...args: Parameters<typeof notion.getPage>) => {
      calls.push(args);
      return rootMap;
    },
  );
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("header tests must never make live requests");
  });
  const result = await loadNotionNavigationHeader();
  assert.deepEqual(calls, [
    [
      rootId,
      {
        chunkLimit: 1,
        fetchCollections: false,
        fetchMissingBlocks: false,
        fetchRelationPages: false,
        signFileUrls: false,
      },
    ],
  ]);
  assert.equal(result.headerRecordMap?.block[rootId].value.id, rootId);
});

void test("the executable header dependency graph excludes full page, tweet, and preview-image processing", async () => {
  const bundle = await build({
    entryPoints: ["lib/server/notion-header.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    write: false,
    metafile: true,
    tsconfig: "test/tsconfig.json",
  });
  const inputs = Object.keys(bundle.metafile!.inputs);
  for (const forbidden of [
    "lib/notion.ts",
    "lib/get-tweets.ts",
    "lib/preview-images.ts",
  ]) {
    assert.ok(
      !inputs.includes(forbidden),
      `header loader must not pull in ${forbidden}`,
    );
  }
});

function sharedStore() {
  const values = new Map<string, unknown>();
  return {
    values,
    async get(key: string) {
      return values.get(key);
    },
    async set(key: string, value: unknown) {
      values.set(key, structuredClone(value));
      return true;
    },
  };
}

void test("independent instances share a successful header without sliding its deadline", async () => {
  const store = sharedStore();
  let clock = 100;
  let reads = 0;
  const options = {
    store,
    cacheKey: "fixture",
    now: () => clock,
    fetchRoot: async () => {
      reads++;
      return {
        ...rootMap,
        block: {
          [rootId]: {
            role: "reader" as const,
            value: { ...rootBlock, version: reads },
          },
        },
      };
    },
  };
  const first = createLoader(options);
  await first();
  clock = 3_600_099;
  const second = createLoader(options);
  assert.equal(
    (await second()).headerRecordMap?.block[rootId].value.version,
    1,
  );
  assert.equal(reads, 1);
  clock = 3_600_100;
  assert.equal(
    (await second()).headerRecordMap?.block[rootId].value.version,
    2,
  );
  assert.equal(reads, 2);
});

void test("manual invalidation is observed by an already warm independent instance", async () => {
  const store = sharedStore();
  let revision = 1;
  const options = {
    store,
    cacheKey: "fixture",
    now: () => 100,
    fetchRoot: async () => ({
      ...rootMap,
      block: {
        [rootId]: {
          role: "reader" as const,
          value: { ...rootBlock, version: revision },
        },
      },
    }),
  };
  const first = createLoader(options);
  const second = createLoader(options);
  await first();
  await second();
  revision = 2;
  await first.invalidate();
  assert.equal(
    (await second()).headerRecordMap?.block[rootId].value.version,
    2,
  );
});

void test("a fill started before invalidation cannot poison the new shared generation", async () => {
  const store = sharedStore();
  let complete!: (map: ExtendedRecordMap) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const old = createLoader({
    store,
    cacheKey: "fixture",
    now: () => 0,
    fetchRoot: async () => {
      started();
      return new Promise<ExtendedRecordMap>((resolve) => {
        complete = resolve;
      });
    },
  });
  const pending = old();
  await ready;
  const freshMap = {
    ...rootMap,
    block: {
      [rootId]: {
        role: "reader" as const,
        value: { ...rootBlock, version: 2 },
      },
    },
  };
  const fresh = createLoader({
    store,
    cacheKey: "fixture",
    now: () => 0,
    fetchRoot: async () => freshMap,
  });
  await fresh.invalidate();
  await fresh();
  complete(rootMap);
  await pending;
  const third = createLoader({
    store,
    cacheKey: "fixture",
    now: () => 0,
    fetchRoot: async () => {
      throw new Error("must reuse revision 2");
    },
  });
  assert.equal((await third()).headerRecordMap?.block[rootId].value.version, 2);
});

void test("unavailable shared storage falls back to fresh origin and failed invalidation is explicit", async () => {
  const store = {
    async get() {
      throw new Error("store down");
    },
    async set() {
      throw new Error("store down");
    },
  };
  const load = createLoader({
    store,
    cacheKey: "fixture",
    now: () => 0,
    fetchRoot: async () => rootMap,
  });
  assert.equal((await load()).headerRecordMap?.block[rootId].value.id, rootId);
  await assert.rejects(load.invalidate(), /store down/);
});

void test("shared cache byte limits reject oversized Unicode metadata before reuse", async () => {
  const store = sharedStore();
  const largeMap = {
    ...rootMap,
    block: {
      [rootId]: {
        role: "reader" as const,
        value: {
          ...rootBlock,
          properties: { title: [["한".repeat(30_000)]] },
        },
      },
    },
  };
  store.values.set("fixture:revision", "fixture-generation");
  store.values.set("fixture:fixture-generation", {
    expiresAt: 3_600_000,
    header: { headerRecordMap: largeMap, headerBlockId: rootId },
  });
  const freshMap = {
    ...rootMap,
    block: {
      [rootId]: {
        role: "reader" as const,
        value: { ...rootBlock, version: 2 },
      },
    },
  };
  const load = createLoader({
    store,
    cacheKey: "fixture",
    now: () => 0,
    fetchRoot: async () => freshMap,
  });
  assert.equal((await load()).headerRecordMap?.block[rootId].value.version, 2);
});

void test("malformed persisted headers are replaced by a fresh successful origin result", async () => {
  const store = sharedStore();
  store.values.set("fixture:revision", "fixture-generation");
  store.values.set("fixture:fixture-generation", {
    expiresAt: 3_600_000,
    header: { headerBlockId: rootId, headerRecordMap: { block: {} } },
  });
  const load = createLoader({
    store,
    cacheKey: "fixture",
    now: () => 0,
    fetchRoot: async () => rootMap,
  });
  assert.equal((await load()).headerRecordMap?.block[rootId].value.id, rootId);
});

void test("failure to verify the revision after a shared read suppresses cacheable header data", async () => {
  let reads = 0;
  const store = {
    async get() {
      if (++reads === 3) throw new Error("revision unavailable");
      return reads === 2 ? undefined : "existing";
    },
    async set() {
      return true;
    },
  };
  const load = createLoader({
    store,
    cacheKey: "fixture",
    now: () => 0,
    fetchRoot: async () => rootMap,
  });
  assert.deepEqual(await load(), {
    headerRecordMap: null,
    headerBlockId: rootId,
  });
});

void test("evicting a revision marker cannot resurrect an older cached header", async () => {
  const store = sharedStore();
  const first = createLoader({
    store,
    cacheKey: "fixture",
    now: () => 0,
    fetchRoot: async () => rootMap,
  });
  await first();
  store.values.delete("fixture:revision");
  const fresh = createLoader({
    store,
    cacheKey: "fixture",
    now: () => 0,
    fetchRoot: async () => ({
      ...rootMap,
      block: {
        [rootId]: {
          role: "reader" as const,
          value: { ...rootBlock, version: 2 },
        },
      },
    }),
  });
  assert.equal((await fresh()).headerRecordMap?.block[rootId].value.version, 2);
});

void test("a cache that silently drops writes still returns a fresh header", async () => {
  const store = {
    async get() {
      return null;
    },
    async set() {},
  };
  const load = createLoader({
    store,
    cacheKey: "fixture",
    now: () => 0,
    fetchRoot: async () => rootMap,
  });
  assert.equal((await load()).headerRecordMap?.block[rootId].value.id, rootId);
});

void test("manual invalidation rejects a silently dropped replacement marker", async () => {
  const store = sharedStore();
  const load = createLoader({
    store,
    cacheKey: "fixture",
    now: () => 0,
    fetchRoot: async () => rootMap,
  });
  await load();
  store.set = async () => true;
  await assert.rejects(load.invalidate(), /not retained/);
});
