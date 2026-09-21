import assert from "node:assert/strict";
import test from "node:test";

import type { ExtendedRecordMap } from "notion-types";

import { db } from "@/lib/db";
import { __pageCacheInternals, getPage } from "@/lib/notion";
import { notion } from "@/lib/notion-api";
import { resolveNotionPage } from "@/lib/resolve-notion-page";

const pageId = "28299029-c0b4-81ce-8999-d425287d3db6";
const empty: ExtendedRecordMap = {
  block: {},
  collection: {},
  collection_view: {},
  notion_user: {},
  collection_query: {},
  signed_urls: {},
};
const stale: ExtendedRecordMap = { ...empty, signed_urls: { revision: "old" } };
const fresh: ExtendedRecordMap = {
  ...stale,
  signed_urls: { revision: "fresh" },
};

void test("manual rendering bypasses warm memory and persistent page caches", async (t) => {
  const key = __pageCacheInternals.getPageCacheKey(pageId);
  t.after(async () => {
    __pageCacheInternals.clear();
    await db.delete(key);
  });
  await db.set(key, stale);
  __pageCacheInternals.setCachedRecordMapInMemory(key, stale);
  t.mock.method(notion, "getPage", async (requestedId: string) =>
    structuredClone(requestedId === pageId ? fresh : empty),
  );

  assert.equal(await getPage(pageId), stale);
  const props = await resolveNotionPage("example.com", pageId, {
    forceRefresh: true,
  });
  assert.equal(props.recordMap?.signed_urls.revision, "fresh");
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
  const manualFetch = getPage(pageId, { forceRefresh: true });
  finishOrdinary(stale);
  const [ordinaryResult, manualResult] = await Promise.all([
    ordinaryFetch,
    manualFetch,
  ]);
  assert.equal(ordinaryResult.signed_urls.revision, "old");
  assert.equal(manualResult.signed_urls.revision, "fresh");
});
