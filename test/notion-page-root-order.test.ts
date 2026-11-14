import assert from "node:assert/strict";
import test from "node:test";

import type { ExtendedRecordMap, PageBlock } from "notion-types";
import { parsePageId } from "notion-utils";

import { navigationLinks, rootNotionPageId } from "@/lib/config";
import { db } from "@/lib/db";
import { getPageTitle } from "@/lib/get-page-title";
import { __pageCacheInternals, getPage } from "@/lib/notion";
import { notion } from "@/lib/notion-api";

const rootId = parsePageId(rootNotionPageId, { uuid: true })!;
const menuId = navigationLinks.flatMap((link) => {
  const id = link?.pageId && parsePageId(link.pageId, { uuid: true });
  return id && id !== rootId ? [id] : [];
})[0]!;

function entry(id: string, title: string, version: number) {
  const value: PageBlock = {
    id,
    type: "page",
    properties: { title: [[title]] },
    version,
    content: [],
    format: {},
    permissions: [],
    parent_id: "fixture-space",
    parent_table: "space",
    created_time: 1,
    last_edited_time: 1,
    alive: true,
    created_by_table: "notion_user",
    created_by_id: "fixture-author",
    last_edited_by_table: "notion_user",
    last_edited_by_id: "fixture-author",
  };
  return { role: "reader" as const, value };
}

function record(block: ExtendedRecordMap["block"]): ExtendedRecordMap {
  return {
    block,
    collection: {},
    collection_view: {},
    collection_query: {},
    notion_user: {},
    signed_urls: {},
  };
}

const wrongOrder = () =>
  record({
    [menuId]: entry(menuId, "Personal Craft", 1),
    [rootId]: entry(rootId, "Studio", 2),
  });

void test("manual refresh keeps the requested Studio root first without restoring stale navigation collisions", async (t) => {
  __pageCacheInternals.clear();
  t.after(() => __pageCacheInternals.clear());
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("offline fixture only");
  });
  t.mock.method(db, "get", async () => undefined);
  t.mock.method(db, "set", async () => undefined);
  t.mock.method(
    notion,
    "getPage",
    async (...[, options]: Parameters<typeof notion.getPage>) =>
      structuredClone(
        options?.fetchMissingBlocks
          ? record({ [rootId]: entry(rootId, "Studio", 2) })
          : record({
              [menuId]: entry(menuId, "Personal Craft", 1),
              [rootId]: entry(rootId, "Stale Studio", 1),
            }),
      ),
  );

  const result = await getPage(rootId, { forceRefresh: true });
  assert.equal(Object.keys(result.block)[0], rootId);
  assert.equal(getPageTitle(result), "Studio");
  assert.equal(result.block[rootId].value.version, 2);
  assert.equal(getPageTitle(await getPage(rootId)), "Studio");
  assert.ok(result.block[menuId], "navigation records are retained");
});

for (const source of ["memory", "persistent"] as const) {
  void test(`a ${source} cache hit repairs page order without an origin fetch or persistent rewrite`, async (t) => {
    __pageCacheInternals.clear();
    t.after(() => __pageCacheInternals.clear());
    const key = __pageCacheInternals.getPageCacheKey(rootId);
    const cached = wrongOrder();
    if (source === "memory")
      __pageCacheInternals.setCachedRecordMapInMemory(key, cached);
    t.mock.method(globalThis, "fetch", async () => {
      assert.fail("offline fixture only");
    });
    t.mock.method(notion, "getPage", async () => {
      assert.fail("cache hit must not fetch Notion");
    });
    t.mock.method(db, "get", async () => cached);
    t.mock.method(db, "set", async () => {
      assert.fail("repair must not restart persistent TTL");
    });

    const result = await getPage(rootId.replaceAll("-", ""));
    assert.equal(Object.keys(result.block)[0], rootId);
    assert.equal(getPageTitle(result), "Studio");
    assert.equal(result.block[rootId].value.version, 2);
    assert.equal(Object.keys(result.block).length, 2);
  });
}
