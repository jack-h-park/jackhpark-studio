import assert from "node:assert/strict";
import test from "node:test";

import { __pageCacheInternals, getPage } from "@/lib/notion";

/**
 * The page cache's deadline must be ABSOLUTE: set when the entry is written,
 * and never moved by a read.
 *
 * Before this was fixed, every cache hit re-wrote the entry with a fresh TTL.
 * With ISR re-rendering /studio every 60s and a 60s cache TTL, the entry was
 * refreshed more often than it could expire, so Notion was never re-read —
 * jackhpark.com served a Notion revision months out of date, and an edit made
 * on 2026-08-30 had still not appeared ten minutes and a dozen requests later.
 *
 * A test that asserted "the code calls set() with a TTL" would have passed the
 * whole time. This one moves the clock instead.
 */

const KEY = "notion-page:test:gh-on:ttl-fixture";
const recordMap = { block: {}, collection: {} } as any;

void test("a read does not extend the cache deadline", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  t.after(() => {
    t.mock.timers.reset();
    __pageCacheInternals.clear();
  });

  __pageCacheInternals.clear();
  __pageCacheInternals.setCachedRecordMapInMemory(KEY, recordMap);

  const ttlMs = Number(process.env.__TEST_TTL_MS ?? 60_000);

  // A read well inside the window is a hit.
  t.mock.timers.tick(ttlMs / 2);
  assert.ok(
    __pageCacheInternals.getCachedRecordMapFromMemory(KEY),
    "entry should still be live halfway through its TTL",
  );

  // Past the ORIGINAL deadline it must be gone — the read above must not have
  // bought it another full TTL.
  t.mock.timers.tick(ttlMs);
  assert.equal(
    __pageCacheInternals.getCachedRecordMapFromMemory(KEY),
    null,
    "the mid-window read extended the deadline — the sliding-expiry bug is back",
  );
});

void test("mirroring a persistent hit into memory keeps the original deadline", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  t.after(() => {
    t.mock.timers.reset();
    __pageCacheInternals.clear();
  });

  __pageCacheInternals.clear();
  __pageCacheInternals.setCachedRecordMapInMemory(KEY, recordMap);

  const ttlMs = Number(process.env.__TEST_TTL_MS ?? 60_000);

  t.mock.timers.tick(ttlMs / 2);
  // This is what readCachedRecordMap does on a persistent hit.
  __pageCacheInternals.setCachedRecordMapInMemory(KEY, recordMap, {
    extendDeadline: false,
  });

  t.mock.timers.tick(ttlMs);
  assert.equal(
    __pageCacheInternals.getCachedRecordMapFromMemory(KEY),
    null,
    "the persistent-hit mirror restarted the TTL",
  );
});

void test("a fresh write does start a new deadline", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  t.after(() => {
    t.mock.timers.reset();
    __pageCacheInternals.clear();
  });

  __pageCacheInternals.clear();
  __pageCacheInternals.setCachedRecordMapInMemory(KEY, recordMap);

  const ttlMs = Number(process.env.__TEST_TTL_MS ?? 60_000);

  t.mock.timers.tick(ttlMs / 2);
  __pageCacheInternals.setCachedRecordMapInMemory(KEY, recordMap); // re-fetched
  t.mock.timers.tick(ttlMs * 0.75);

  assert.ok(
    __pageCacheInternals.getCachedRecordMapFromMemory(KEY),
    "a genuine re-fetch should reset the TTL",
  );
});

// THE regression test: this is the one that fails against the original code.
// (The three above pin the surrounding contract; they passed before the fix too,
// because the renewal happened in getPage rather than in the cache helpers.)
void test("getPage on a cache hit does not extend the deadline", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  t.after(() => {
    t.mock.timers.reset();
    __pageCacheInternals.clear();
  });

  const pageId = "28299029c0b481ce8999d425287d3db6";
  const key = __pageCacheInternals.getPageCacheKey(pageId);
  const ttlMs = Number(process.env.__TEST_TTL_MS ?? 60_000);

  __pageCacheInternals.clear();
  __pageCacheInternals.setCachedRecordMapInMemory(key, recordMap);

  // Serve the page from cache repeatedly, the way ISR does every 60s.
  t.mock.timers.tick(ttlMs / 2);
  await getPage(pageId);
  t.mock.timers.tick(ttlMs / 2 + 1);

  assert.equal(
    __pageCacheInternals.getCachedRecordMapFromMemory(key),
    null,
    "serving from cache renewed the TTL — Notion would never be read again",
  );
});
