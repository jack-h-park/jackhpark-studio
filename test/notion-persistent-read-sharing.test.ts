import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";

import type { ExtendedRecordMap } from "notion-types";

import { notionPageCacheTTL } from "@/lib/config";
import { db } from "@/lib/db";
import { __pageCacheInternals, getPage } from "@/lib/notion";
import { notion } from "@/lib/notion-api";

const pageId = "11111111-1111-4111-8111-111111111111";
const otherPageId = "22222222-2222-4222-8222-222222222222";
const key = __pageCacheInternals.getPageCacheKey(pageId);
const otherKey = __pageCacheInternals.getPageCacheKey(otherPageId);
const record = (revision?: string): ExtendedRecordMap => ({
  block: {},
  collection: {},
  collection_view: {},
  notion_user: {},
  collection_query: {},
  signed_urls: revision ? { revision } : {},
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function prepare(t: TestContext) {
  __pageCacheInternals.clear();
  await db.delete(key);
  await db.delete(otherKey);
  t.after(async () => {
    __pageCacheInternals.clear();
    await db.delete(key);
    await db.delete(otherKey);
  });
}

void test("overlapping same-page aliases read and decode one real persistent snapshot", async (t) => {
  await prepare(t);
  await db.set(key, record("stored"));
  const originalGet = db.get.bind(db);
  let reads = 0;
  t.mock.method(db, "get", async (requestedKey: string) => {
    if (requestedKey === key) reads++;
    return originalGet(requestedKey);
  });
  // Keep the installed Keyv/json-buffer decoder, rather than replacing it.
  const decoder = db as unknown as { deserialize: (value: string) => unknown };
  const originalDecode = decoder.deserialize.bind(db);
  let decodes = 0;
  t.mock.method(decoder, "deserialize", (value: string) => {
    decodes++;
    return originalDecode(value);
  });
  const values = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      getPage(index % 2 ? pageId : pageId.replaceAll("-", "")),
    ),
  );
  assert.equal(reads, 1);
  assert.equal(decodes, 1);
  assert.ok(values.every((value) => value === values[0]));
  assert.equal(values[0].signed_urls.revision, "stored");

  // A settled promise must not become a second permanent cache.
  __pageCacheInternals.clear();
  await db.set(key, record("changed"));
  assert.equal((await getPage(pageId)).signed_urls.revision, "changed");
  assert.equal(reads, 2);
  assert.equal(decodes, 2);
});

void test("persistent reads for different page keys remain independent", async (t) => {
  await prepare(t);
  await db.set(key, record("first"));
  await db.set(otherKey, record("second"));
  const originalGet = db.get.bind(db);
  const reads: string[] = [];
  t.mock.method(db, "get", async (requestedKey: string) => {
    reads.push(requestedKey);
    return originalGet(requestedKey);
  });
  const values = await Promise.all([
    getPage(pageId),
    getPage(otherPageId),
    getPage(pageId),
    getPage(otherPageId),
  ]);
  assert.deepEqual(
    values.map((value) => value.signed_urls.revision),
    ["first", "second", "first", "second"],
  );
  assert.deepEqual(reads.toSorted(), [key, otherKey].toSorted());
});

for (const outcome of ["miss", "error"] as const) {
  void test(`shared persistent ${outcome} is released and still deduplicates the origin fallback`, async (t) => {
    await prepare(t);
    const originalGet = db.get.bind(db);
    let reads = 0;
    t.mock.method(db, "get", async (requestedKey: string) => {
      if (requestedKey === key && ++reads === 1 && outcome === "error") {
        throw new Error("synthetic persistent read failure");
      }
      return originalGet(requestedKey);
    });
    let originReads = 0;
    t.mock.method(notion, "getPage", async (requestedId: string) => {
      if (requestedId !== pageId) return record();
      originReads++;
      return record("fresh");
    });
    const values = await Promise.all(
      Array.from({ length: 20 }, () => getPage(pageId)),
    );
    assert.ok(values.every((value) => value.signed_urls.revision === "fresh"));
    assert.equal(reads, 1);
    assert.equal(originReads, 1);
    __pageCacheInternals.clear();
    assert.equal((await getPage(pageId)).signed_urls.revision, "fresh");
    assert.equal(reads, 2);
    assert.equal(originReads, 1);
  });
}

void test("a shared persistent hit does not extend the absolute cache deadline", async (t) => {
  await prepare(t);
  assert.equal(typeof notionPageCacheTTL, "number");
  const ttl = notionPageCacheTTL!;
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  t.after(() => t.mock.timers.reset());
  await db.set(key, record("stored"), ttl);
  let originReads = 0;
  t.mock.method(notion, "getPage", async (requestedId: string) => {
    if (requestedId !== pageId) return record();
    originReads++;
    return record("after-expiry");
  });
  await Promise.all(Array.from({ length: 20 }, () => getPage(pageId)));
  t.mock.timers.tick(ttl / 2);
  assert.equal((await getPage(pageId)).signed_urls.revision, "stored");
  t.mock.timers.tick(ttl / 2 + 1);
  const values = await Promise.all(
    Array.from({ length: 20 }, () => getPage(pageId)),
  );
  assert.ok(
    values.every((value) => value.signed_urls.revision === "after-expiry"),
  );
  assert.equal(originReads, 1);
});

for (const finishRefreshFirst of [false, true]) {
  void test(
    `manual refresh wins a shared stale snapshot when refresh ${finishRefreshFirst ? "finishes first" : "is still active"}`,
    { timeout: 5000 },
    async (t) => {
      await prepare(t);
      await db.set(key, record("stale"));
      const readStarted = gate();
      const releaseRead = gate();
      const originStarted = gate();
      const releaseOrigin = gate();
      t.after(() => {
        releaseRead.release();
        releaseOrigin.release();
      });
      const originalGet = db.get.bind(db);
      let reads = 0;
      t.mock.method(db, "get", async (requestedKey: string) => {
        if (requestedKey !== key || ++reads !== 1)
          return originalGet(requestedKey);
        const snapshot = await originalGet(requestedKey);
        readStarted.release();
        await releaseRead.promise;
        return snapshot;
      });
      t.mock.method(notion, "getPage", async (requestedId: string) => {
        if (requestedId !== pageId) return record();
        originStarted.release();
        await releaseOrigin.promise;
        return record("manual");
      });
      const ordinary = Array.from({ length: 20 }, () => getPage(pageId));
      await readStarted.promise;
      const manual = getPage(pageId, { forceRefresh: true });
      await originStarted.promise;
      const follower = getPage(pageId);
      if (finishRefreshFirst) {
        releaseOrigin.release();
        assert.equal((await manual).signed_urls.revision, "manual");
        releaseRead.release();
      } else {
        releaseRead.release();
        await setImmediate();
        releaseOrigin.release();
      }
      const values = await Promise.all([...ordinary, manual, follower]);
      assert.ok(
        values.every((value) => value.signed_urls.revision === "manual"),
      );
      assert.equal(reads, 1);
      __pageCacheInternals.clear();
      assert.equal((await getPage(pageId)).signed_urls.revision, "manual");
      assert.equal(reads, 2);
    },
  );
}

void test(
  "failed active refresh propagates to shared readers without poisoning a later cache hit",
  { timeout: 5000 },
  async (t) => {
    await prepare(t);
    await db.set(key, record("healthy"));
    const readStarted = gate();
    const releaseRead = gate();
    const originStarted = gate();
    const releaseOrigin = gate();
    t.after(() => {
      releaseRead.release();
      releaseOrigin.release();
    });
    const originalGet = db.get.bind(db);
    let reads = 0;
    t.mock.method(db, "get", async (requestedKey: string) => {
      if (requestedKey !== key || ++reads !== 1)
        return originalGet(requestedKey);
      const snapshot = await originalGet(requestedKey);
      readStarted.release();
      await releaseRead.promise;
      return snapshot;
    });
    const failure = new Error("synthetic manual fetch failure");
    t.mock.method(notion, "getPage", async (requestedId: string) => {
      if (requestedId !== pageId) return record();
      originStarted.release();
      await releaseOrigin.promise;
      throw failure;
    });
    const ordinary = Array.from({ length: 20 }, () => getPage(pageId));
    await readStarted.promise;
    const manual = getPage(pageId, { forceRefresh: true });
    const outcomes = Promise.allSettled([...ordinary, manual]);
    await originStarted.promise;
    releaseRead.release();
    await setImmediate();
    releaseOrigin.release();
    for (const outcome of await outcomes) {
      assert.equal(outcome.status, "rejected");
      if (outcome.status === "rejected") assert.equal(outcome.reason, failure);
    }
    assert.equal((await getPage(pageId)).signed_urls.revision, "healthy");
    assert.equal(reads, 2);
  },
);
