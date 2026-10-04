import assert from "node:assert/strict";
import test from "node:test";

import type { ExtendedRecordMap } from "notion-types";

import { db } from "@/lib/db";
import { __pageCacheInternals, getPage } from "@/lib/notion";
import { notion } from "@/lib/notion-api";

import {
  buildImagePageRecordMap,
  fixtureCollectionId,
  fixtureImagePageId,
  fixtureViewId,
} from "./fixtures/notion-record-maps";

const collectionBlockId = "28299029-c0b4-81ce-8999-d425287d3de0";
const toggleId = "28299029-c0b4-81ce-8999-d425287d3de1";
const childPageId = "28299029-c0b4-81ce-8999-d425287d3de2";

function sourceMap() {
  const map = buildImagePageRecordMap();
  map.block[collectionBlockId] = {
    value: {
      id: collectionBlockId,
      type: "collection_view",
      collection_id: fixtureCollectionId,
      view_ids: [fixtureViewId],
      parent_id: childPageId,
    },
  } as unknown as ExtendedRecordMap["block"][string];
  map.collection_view[fixtureViewId] = {
    value: {
      id: fixtureViewId,
      type: "gallery",
      collection_id: fixtureCollectionId,
      format: {
        collection_group_by: { property: "category" },
        collection_groups: [
          { property: "category", value: { type: "select", value: "Work" } },
        ],
      },
    },
  } as unknown as ExtendedRecordMap["collection_view"][string];
  return map;
}

for (const mode of ["fresh", "memory", "persistent", "manual"] as const) {
  void test(`unreferenced parent collection makes no hydration query on ${mode} reads`, async (t) => {
    const source = sourceMap();
    source.collection_query[fixtureCollectionId] = {
      [fixtureViewId]: { retained: { blockIds: ["external-row"] } },
    } as unknown as ExtendedRecordMap["collection_query"][string];
    source.block = {
      [collectionBlockId]: source.block[collectionBlockId],
      ...source.block,
    };
    const key = __pageCacheInternals.getPageCacheKey(fixtureImagePageId);
    __pageCacheInternals.clear();
    await db.delete(key);
    t.after(async () => {
      __pageCacheInternals.clear();
      await db.delete(key);
    });
    t.mock.method(globalThis, "fetch", async () => {
      assert.fail("body-scope tests must not make live requests");
    });
    t.mock.method(notion, "getPage", async () => structuredClone(source));
    let reads = 0;
    t.mock.method(notion, "getCollectionData", async () => {
      reads++;
      return { result: {}, recordMap: buildImagePageRecordMap() };
    });
    t.mock.method(console, "warn", () => {});
    if (mode === "memory")
      __pageCacheInternals.setCachedRecordMapInMemory(
        key,
        structuredClone(source),
      );
    if (mode === "persistent") await db.set(key, structuredClone(source));
    const result = await getPage(fixtureImagePageId, {
      forceRefresh: mode === "manual",
    });
    await Promise.all([
      getPage(fixtureImagePageId),
      getPage(fixtureImagePageId),
    ]);
    assert.equal(reads, 0);
    assert.ok(result.collection_view[fixtureViewId], "metadata is retained");
    assert.deepEqual(result.collection_query, source.collection_query);
  });
}

for (const placement of [
  "nested",
  "synced",
  "child-page",
  "child-database",
  "root-database",
  "root-inline-database",
  "mention",
] as const) {
  void test(`body hydration respects ${placement} rendering boundaries with nested wire records`, async (t) => {
    const source = sourceMap();
    const root = source.block[fixtureImagePageId].value;
    root.content = [toggleId];
    source.block[toggleId] = {
      value: {
        id: toggleId,
        type:
          placement === "synced"
            ? "transclusion_reference"
            : placement === "mention"
              ? "text"
              : "toggle",
        ...(placement === "mention"
          ? { properties: { title: [["‣", [["p", collectionBlockId]]]] } }
          : placement === "synced"
            ? {
                format: {
                  transclusion_reference_pointer: { id: collectionBlockId },
                },
              }
            : {
                content: [
                  placement === "child-page" ? childPageId : collectionBlockId,
                ],
              }),
      },
    } as unknown as ExtendedRecordMap["block"][string];
    if (placement === "child-page") {
      source.block[childPageId] = {
        value: { id: childPageId, type: "page", content: [collectionBlockId] },
      } as unknown as ExtendedRecordMap["block"][string];
    }
    if (placement === "child-database") {
      source.block[collectionBlockId].value.type = "collection_view_page";
    }
    if (placement === "root-database" || placement === "root-inline-database") {
      source.block[fixtureImagePageId] = {
        value: {
          ...root,
          type:
            placement === "root-database"
              ? "collection_view_page"
              : "collection_view",
          content: [],
          collection_id: fixtureCollectionId,
          view_ids: [fixtureViewId],
        },
      } as unknown as ExtendedRecordMap["block"][string];
    }
    for (const [id, entry] of Object.entries(source.block)) {
      source.block[id] = {
        value: { role: "reader", value: entry.value },
      } as unknown as ExtendedRecordMap["block"][string];
    }
    const key = __pageCacheInternals.getPageCacheKey(fixtureImagePageId);
    t.after(async () => {
      __pageCacheInternals.clear();
      await db.delete(key);
    });
    t.mock.method(globalThis, "fetch", async () => {
      assert.fail("body-scope tests must not make live requests");
    });
    t.mock.method(notion, "getPage", async () => structuredClone(source));
    const views: string[] = [];
    t.mock.method(
      notion,
      "getCollectionData",
      async (_id: string, viewId: string) => {
        views.push(viewId);
        return {
          result: {
            reducerResults: { "results:select:Work": { blockIds: [] } },
          },
          recordMap: { ...buildImagePageRecordMap(), block: {} },
        };
      },
    );
    t.mock.method(console, "warn", () => {});
    const result = await getPage(fixtureImagePageId.replaceAll("-", ""), {
      forceRefresh: true,
    });
    await getPage(fixtureImagePageId);
    const isLinkedPage =
      placement === "child-page" ||
      placement === "child-database" ||
      placement === "mention";
    assert.deepEqual(views, isLinkedPage ? [] : [fixtureViewId]);
    if (!isLinkedPage) {
      const query = result.collection_query[fixtureCollectionId][
        fixtureViewId
      ] as unknown as Record<string, unknown>;
      assert.deepEqual(query["results:select:Work"], { blockIds: [] });
    }
  });
}
