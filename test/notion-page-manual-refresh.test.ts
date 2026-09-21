import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

import type { ExtendedRecordMap, PageBlock } from "notion-types";
import { getPageTitle } from "notion-utils";

import { db } from "@/lib/db";
import { __pageCacheInternals, getPage } from "@/lib/notion";
import { notion } from "@/lib/notion-api";
import { resolveNotionPage } from "@/lib/resolve-notion-page";

const pageId = "37899029-c0b4-801b-9425-fe5857860ca7";
const empty: ExtendedRecordMap = {
  block: {},
  collection: {},
  collection_view: {},
  notion_user: {},
  collection_query: {},
  signed_urls: {},
};
const oldPage: PageBlock = {
  id: pageId,
  type: "page",
  version: 1,
  properties: { title: [["Old title"]] },
  content: [],
  created_time: 1,
  last_edited_time: 1,
  parent_id: "root",
  parent_table: "space",
  alive: true,
  format: {},
  permissions: [{ role: "reader", type: "public_permission" }],
  created_by_table: "notion_user",
  created_by_id: "author",
  last_edited_by_table: "notion_user",
  last_edited_by_id: "author",
};
const stale: ExtendedRecordMap = {
  ...empty,
  block: {
    [pageId]: {
      role: "reader",
      value: oldPage,
    },
  },
  signed_urls: { revision: "old" },
};
const fresh: ExtendedRecordMap = {
  ...stale,
  block: {
    [pageId]: {
      ...stale.block[pageId],
      value: {
        ...oldPage,
        version: 2,
        properties: { title: [["New title"]] },
      },
    },
  },
  signed_urls: { revision: "fresh" },
};

void test("manual rendering bypasses warm memory and persistent page caches", async (t) => {
  const key = __pageCacheInternals.getPageCacheKey(pageId);
  t.after(async () => {
    __pageCacheInternals.clear();
    await db.delete(key);
  });
  t.mock.method(
    notion,
    "getPage",
    async (...[, options]: Parameters<typeof notion.getPage>) =>
      structuredClone(
        options?.fetchMissingBlocks ? fresh : { ...stale, signed_urls: {} },
      ),
  );
  // Prime the actual memoized navigation map with an overlapping page block.
  assert.equal(getPageTitle(await getPage(pageId)), "Old title");
  await db.set(key, stale);
  __pageCacheInternals.setCachedRecordMapInMemory(key, stale);

  assert.equal(await getPage(pageId), stale);
  const props = await resolveNotionPage("example.com", pageId, {
    forceRefresh: true,
  });
  assert.equal(props.recordMap?.signed_urls.revision, "fresh");
  assert.equal(getPageTitle(props.recordMap!), "New title");
  assert.equal((await getPage(pageId)).signed_urls.revision, "fresh");

  // The renderer can start on an instance with only the shared cache warmed.
  __pageCacheInternals.clear();
  await db.set(key, stale);
  assert.equal(
    (await getPage(pageId, { forceRefresh: true })).signed_urls.revision,
    "fresh",
  );
});

void test("a failed manual fetch rejects without overwriting a healthy cached record map", async (t) => {
  const key = __pageCacheInternals.getPageCacheKey(pageId);
  const failure = new Error("Notion unavailable");
  t.after(async () => {
    __pageCacheInternals.clear();
    await db.delete(key);
  });
  __pageCacheInternals.setCachedRecordMapInMemory(key, stale);
  t.mock.method(notion, "getPage", async () => {
    throw failure;
  });

  await assert.rejects(getPage(pageId, { forceRefresh: true }), failure);
  assert.equal(await getPage(pageId), stale);
});

void test("manual refresh does not reuse an ordinary fetch already in flight", async (t) => {
  const key = __pageCacheInternals.getPageCacheKey(pageId);
  t.after(async () => {
    __pageCacheInternals.clear();
    await db.delete(key);
  });
  __pageCacheInternals.clear();
  await db.delete(key);
  let markStarted!: () => void;
  let finishOrdinary!: (value: ExtendedRecordMap) => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const ordinary = new Promise<ExtendedRecordMap>((resolve) => {
    finishOrdinary = resolve;
  });
  let reads = 0;
  t.mock.method(notion, "getPage", async (requestedId: string) => {
    if (requestedId !== pageId) return structuredClone(empty);
    if (++reads === 1) {
      markStarted();
      return ordinary;
    }
    return structuredClone(fresh);
  });

  const ordinaryFetch = getPage(pageId);
  await started;
  const manualResult = await getPage(pageId, { forceRefresh: true });
  finishOrdinary(stale);
  const ordinaryResult = await ordinaryFetch;
  assert.equal(ordinaryResult.signed_urls.revision, "old");
  assert.equal(manualResult.signed_urls.revision, "fresh");
  assert.equal((await getPage(pageId)).signed_urls.revision, "fresh");
  __pageCacheInternals.clear();
  assert.equal((await getPage(pageId)).signed_urls.revision, "fresh");
});

void test("a forced cache write follows an ordinary persistent write already in flight", async (t) => {
  const key = __pageCacheInternals.getPageCacheKey(pageId);
  t.after(async () => {
    __pageCacheInternals.clear();
    await db.delete(key);
  });
  let markWriteStarted!: () => void;
  let releaseWrite!: () => void;
  const writeStarted = new Promise<void>((resolve) => {
    markWriteStarted = resolve;
  });
  const writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  const originalSet = db.set.bind(db);
  t.mock.method(db, "set", async (...args: Parameters<typeof db.set>) => {
    const recordMap = args[1] as ExtendedRecordMap;
    if (args[0] === key && recordMap.signed_urls.revision === "old") {
      markWriteStarted();
      await writeGate;
    }
    return originalSet(...args);
  });
  let reads = 0;
  t.mock.method(notion, "getPage", async () =>
    structuredClone(++reads === 1 ? stale : fresh),
  );

  const ordinary = getPage(pageId);
  await writeStarted;
  const forced = getPage(pageId, { forceRefresh: true });
  // Let the forced fetch reach the asynchronous persistent boundary.
  await setImmediate();
  releaseWrite();
  await Promise.all([ordinary, forced]);
  assert.equal((await getPage(pageId)).signed_urls.revision, "fresh");
  __pageCacheInternals.clear();
  assert.equal((await getPage(pageId)).signed_urls.revision, "fresh");
});

void test("the latest forced fetch owns the cache when forced requests finish out of order", async (t) => {
  const key = __pageCacheInternals.getPageCacheKey(pageId);
  t.after(async () => {
    __pageCacheInternals.clear();
    await db.delete(key);
  });
  let releaseEarlier!: (value: ExtendedRecordMap) => void;
  const earlier = new Promise<ExtendedRecordMap>((resolve) => {
    releaseEarlier = resolve;
  });
  let reads = 0;
  t.mock.method(notion, "getPage", async () =>
    ++reads === 1 ? earlier : structuredClone(fresh),
  );

  const first = getPage(pageId, { forceRefresh: true });
  const second = getPage(pageId, { forceRefresh: true });
  const ordinary = getPage(pageId);
  assert.equal((await second).signed_urls.revision, "fresh");
  assert.equal((await ordinary).signed_urls.revision, "fresh");
  releaseEarlier(stale);
  await first;
  assert.equal((await getPage(pageId)).signed_urls.revision, "fresh");
  __pageCacheInternals.clear();
  assert.equal((await getPage(pageId)).signed_urls.revision, "fresh");
});

void test("a persistent read started before a forced refresh cannot restore its stale snapshot", async (t) => {
  const key = __pageCacheInternals.getPageCacheKey(pageId);
  t.after(async () => {
    __pageCacheInternals.clear();
    await db.delete(key);
  });
  await db.set(key, stale);
  let releaseRead!: (value: ExtendedRecordMap) => void;
  const delayedRead = new Promise<ExtendedRecordMap>((resolve) => {
    releaseRead = resolve;
  });
  const originalGet = db.get.bind(db);
  let reads = 0;
  t.mock.method(db, "get", async (requestedKey: string) =>
    requestedKey === key && ++reads === 1
      ? delayedRead
      : originalGet(requestedKey),
  );
  t.mock.method(notion, "getPage", async () => structuredClone(fresh));
  const ordinary = getPage(pageId);
  await getPage(pageId, { forceRefresh: true });
  releaseRead(stale);
  assert.equal((await ordinary).signed_urls.revision, "fresh");
  assert.equal((await getPage(pageId)).signed_urls.revision, "fresh");
});
