import assert from "node:assert/strict";
import test from "node:test";

import type { ExtendedRecordMap } from "notion-types";
import { parsePageId } from "notion-utils";

import { navigationLinks } from "@/lib/config";
import { db } from "@/lib/db";
import { __pageCacheInternals, getPage } from "@/lib/notion";
import { notion } from "@/lib/notion-api";

import {
  buildImagePageRecordMap,
  fixtureCollectionId,
  fixtureImagePageId,
  fixtureViewId,
} from "./fixtures/notion-record-maps";

const menuViewId = "28299029-c0b4-81ce-8999-d425287d3dd1";
const menuCollectionId = "28299029-c0b4-81ce-8999-d425287d3dd2";
const group = {
  property: "docType",
  hidden: false,
  value: { type: "select", value: "profile" },
};

function view(id: string, collectionId: string) {
  return {
    role: "reader",
    value: {
      id,
      type: "gallery",
      collection_id: collectionId,
      format: {
        collection_group_by: { property: "docType" },
        collection_groups: [group],
      },
    },
  } as unknown as ExtendedRecordMap["collection_view"][string];
}

void test("custom navigation never adds collection hydration targets to a page", async (t) => {
  const key = __pageCacheInternals.getPageCacheKey(fixtureImagePageId);
  const menuPageIds = navigationLinks.flatMap((link) => {
    const id = link?.pageId && parsePageId(link.pageId, { uuid: true });
    return id ? [id] : [];
  });
  assert.ok(menuPageIds.length > 0);
  const menu = buildImagePageRecordMap();
  menu.block = Object.fromEntries(
    menuPageIds.map((id) => [
      id,
      {
        role: "reader",
        value: { id, type: "page", properties: { title: [["Menu page"]] } },
      },
    ]),
  ) as ExtendedRecordMap["block"];
  menu.collection_view = {
    [menuViewId]: view(menuViewId, menuCollectionId),
    // A navigation chunk can carry an overlapping, older body view too.
    [fixtureViewId]: view(fixtureViewId, fixtureCollectionId),
  };
  const menuBodyView = menu.collection_view[fixtureViewId].value;
  menuBodyView.name = "Stale menu view";
  menu.collection_query = {
    [fixtureCollectionId]: {
      [fixtureViewId]: {
        reducerResults: {
          "results:select:profile": { blockIds: ["stale-row"] },
        },
      },
    },
  } as unknown as ExtendedRecordMap["collection_query"];
  let source = buildImagePageRecordMap();
  const collectionQueries: string[] = [];
  t.after(async () => {
    __pageCacheInternals.clear();
    await db.delete(key);
  });
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("collection-budget tests must not make live requests");
  });
  t.mock.method(console, "warn", () => {});
  t.mock.method(notion, "getPage", async (pageId: string) =>
    structuredClone(menuPageIds.includes(pageId) ? menu : source),
  );
  t.mock.method(
    notion,
    "getCollectionData",
    async (_collectionId: string, viewId: string) => {
      collectionQueries.push(viewId);
      return {
        result: {
          reducerResults: {
            "results:select:profile": { blockIds: [fixtureImagePageId] },
          },
        },
        recordMap: buildImagePageRecordMap(),
      };
    },
  );

  await t.test(
    "fresh, warm and concurrent warm leaf reads make no menu collection queries",
    async () => {
      __pageCacheInternals.clear();
      await db.delete(key);
      const fresh = await getPage(fixtureImagePageId);
      await getPage(fixtureImagePageId);
      await Promise.all([
        getPage(fixtureImagePageId),
        getPage(fixtureImagePageId),
      ]);
      assert.deepEqual(collectionQueries, []);
      assert.equal(
        fresh.block[menuPageIds[0]].value.properties?.title?.[0][0],
        "Menu page",
      );
      assert.deepEqual(fresh.collection_view, {});
      assert.deepEqual(fresh.collection_query, {});
      __pageCacheInternals.clear();
      await getPage(fixtureImagePageId);
      assert.deepEqual(collectionQueries, []);
    },
  );

  await t.test(
    "missing body group data is hydrated without importing an overlapping menu result",
    async () => {
      source = buildImagePageRecordMap();
      source.collection_view[fixtureViewId] = view(
        fixtureViewId,
        fixtureCollectionId,
      );
      source.collection_view[fixtureViewId].value.name = "Current body view";
      collectionQueries.length = 0;
      const fresh = await getPage(fixtureImagePageId, { forceRefresh: true });
      await getPage(fixtureImagePageId);
      assert.deepEqual(collectionQueries, [fixtureViewId]);
      assert.equal(
        fresh.collection_view[fixtureViewId].value.name,
        "Current body view",
      );
      const output = fresh.collection_query[fixtureCollectionId][
        fixtureViewId
      ] as unknown as Record<string, { blockIds: string[] }>;
      assert.deepEqual(output["results:select:profile"].blockIds, [
        fixtureImagePageId,
      ]);
      assert.equal(fresh.collection_view[menuViewId], undefined);
    },
  );
});
