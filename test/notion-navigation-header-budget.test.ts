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
