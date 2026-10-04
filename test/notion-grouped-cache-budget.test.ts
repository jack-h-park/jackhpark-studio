import assert from "node:assert/strict";
import test from "node:test";

import type { ExtendedRecordMap } from "notion-types";

import { notionPageCacheTTL } from "@/lib/config";
import { db } from "@/lib/db";
import { __pageCacheInternals, getPage } from "@/lib/notion";
import { notion } from "@/lib/notion-api";

import {
  buildImagePageRecordMap,
  fixtureCollectionId,
  fixtureImagePageId,
  fixtureViewId,
} from "./fixtures/notion-record-maps";

function groupedPage(type: "gallery" | "list" | "board" = "gallery") {
  const map = buildImagePageRecordMap();
  const blockId = "28299029-c0b4-81ce-8999-d425287d3dea";
  map.block[fixtureImagePageId].value.content?.push(blockId);
  map.block[blockId] = {
    value: {
      id: blockId,
      type: "collection_view",
      parent_id: fixtureImagePageId,
      collection_id: fixtureCollectionId,
      view_ids: [fixtureViewId],
    },
  } as unknown as ExtendedRecordMap["block"][string];
  const groups = ["profile", "operations"].map((label) => ({
    property: "docType",
    hidden: false,
    value: { type: "select", value: label },
  }));
  const format =
    type === "board"
      ? { board_columns_by: { property: "docType" }, board_columns: groups }
      : {
          collection_group_by: { property: "docType" },
          collection_groups: groups,
        };
  map.collection_view[fixtureViewId] = {
    role: "reader",
    value: {
      id: fixtureViewId,
      type,
      collection_id: fixtureCollectionId,
      format,
    },
  } as unknown as ExtendedRecordMap["collection_view"][string];
  map.collection_query[fixtureCollectionId] = {
    [fixtureViewId]: {
      reducerResults: {
        "results:select:profile": {
          type: "results",
          blockIds: [fixtureImagePageId],
        },
        "results:select:operations": { type: "results", blockIds: [] },
        ...(type === "board"
          ? {
              board_columns: {
                results: groups.map((group) => ({
                  value: group.value,
                  total: group.value.value === "profile" ? 1 : 0,
                })),
              },
            }
          : {}),
      },
    },
  } as unknown as ExtendedRecordMap["collection_query"][string];
  return map;
}

for (const type of ["list", "gallery"] as const) {
  for (const mode of ["fresh", "memory", "persistent"] as const) {
    void test(`${type} ${mode} read repairs newly advertised groups before caching`, async (t) => {
      if (mode === "memory") {
        t.mock.timers.enable({ apis: ["Date"], now: 0 });
        t.after(() => t.mock.timers.reset());
      }
      const source = groupedPage(type);
      const view = source.collection_view[fixtureViewId].value as unknown as {
        format: { collection_groups: unknown[] };
      };
      view.format.collection_groups = view.format.collection_groups.slice(0, 1);
      const partial = {
        [`${type}_groups`]: {
          type: "groups",
          version: "v2",
          hasMore: false,
          results: ["profile", "operations"].map((value) => ({
            value: { type: "select", value },
            visible: true,
          })),
        },
        "results:select:profile": {
          type: "results",
          blockIds: [fixtureImagePageId],
          hasMore: false,
        },
      };
      source.collection_query[fixtureCollectionId][fixtureViewId] = {
        reducerResults: partial,
      } as unknown as ExtendedRecordMap["collection_query"][string][string];
      const key = __pageCacheInternals.getPageCacheKey(fixtureImagePageId);
      __pageCacheInternals.clear();
      await db.delete(key);
      t.after(async () => {
        __pageCacheInternals.clear();
        await db.delete(key);
      });
      if (mode === "memory")
        __pageCacheInternals.setCachedRecordMapInMemory(
          key,
          structuredClone(source),
        );
      if (mode === "persistent") await db.set(key, structuredClone(source));
      if (mode === "memory") t.mock.timers.tick(Number(notionPageCacheTTL) / 2);
      t.mock.method(notion, "getPage", async () => structuredClone(source));
      let reads = 0;
      t.mock.method(
        notion,
        "getCollectionData",
        async (...args: Parameters<typeof notion.getCollectionData>) => {
          reads++;
          const requested = args[2]?.format as unknown as {
            collection_groups: Array<{ value: { value: string } }>;
          };
          assert.deepEqual(
            requested.collection_groups.map((group) => group.value.value),
            reads === 1 ? ["profile"] : ["profile", "operations"],
          );
          assert.ok(reads <= 2, "repair is bounded to one follow-up query");
          return {
            result: {
              reducerResults:
                reads === 1
                  ? partial
                  : {
                      ...partial,
                      "results:select:operations": {
                        type: "results",
                        blockIds: ["new-operation"],
                        hasMore: false,
                      },
                    },
            },
            recordMap: {
              block: {
                "new-operation": {
                  value: {
                    id: "new-operation",
                    type: "page",
                    properties: { title: [["New operation"]] },
                  },
                },
              },
            },
          } as unknown as Awaited<ReturnType<typeof notion.getCollectionData>>;
        },
      );
      const repaired = await getPage(fixtureImagePageId, {
        forceRefresh: mode === "fresh",
      });
      assert.equal(reads, 2);
      const output = repaired.collection_query[fixtureCollectionId][
        fixtureViewId
      ] as unknown as Record<string, { blockIds: string[] }>;
      assert.deepEqual(output["results:select:operations"].blockIds, [
        "new-operation",
      ]);
      assert.ok(repaired.block["new-operation"]);
      const warm = await getPage(fixtureImagePageId);
      assert.deepEqual(warm.collection_query, repaired.collection_query);
      assert.ok(
        warm.block["new-operation"],
        "warm results retain newly fetched row blocks",
      );
      assert.equal(reads, 2, "the repaired warm page does not query again");
      if (mode === "memory") {
        t.mock.timers.tick(Number(notionPageCacheTTL) / 2 + 1);
        assert.equal(
          __pageCacheInternals.getCachedRecordMapFromMemory(key),
          null,
          "hydration must not restart the original cache deadline",
        );
      }
    });
  }
}

for (const mode of [
  "complete-empty",
  "hidden",
  "incomplete",
  "error",
] as const) {
  void test(`discovered ${mode} groups preserve truthful results and bounded repair`, async (t) => {
    const source = groupedPage("list");
    const view = source.collection_view[fixtureViewId].value as unknown as {
      format: { collection_groups: unknown[] };
    };
    view.format.collection_groups = [];
    source.collection_query[fixtureCollectionId][fixtureViewId] =
      {} as ExtendedRecordMap["collection_query"][string][string];
    const key = __pageCacheInternals.getPageCacheKey(fixtureImagePageId);
    t.after(async () => {
      __pageCacheInternals.clear();
      await db.delete(key);
    });
    t.mock.method(notion, "getPage", async () => structuredClone(source));
    let reads = 0;
    t.mock.method(notion, "getCollectionData", async () => {
      reads++;
      assert.ok(reads <= 2);
      if (mode === "error" && reads === 2)
        throw new Error("Collection unavailable");
      return {
        result: {
          reducerResults: {
            list_groups: {
              type: "groups",
              version: "v2",
              hasMore: false,
              results: [
                { value: { type: "select", value: "profile" }, visible: true },
                {
                  value: { type: "select", value: "operations" },
                  visible: mode !== "hidden",
                },
              ],
            },
            "results:select:profile": {
              type: "results",
              blockIds: ["first-profile"],
            },
            ...(mode === "complete-empty"
              ? {
                  "results:select:operations": {
                    type: "results",
                    blockIds: [],
                    hasMore: false,
                  },
                }
              : {}),
          },
        },
        recordMap: {
          block: {
            "first-profile": {
              value: {
                id: "first-profile",
                type: "page",
                properties: { title: [["First profile"]] },
              },
            },
          },
        },
      } as unknown as Awaited<ReturnType<typeof notion.getCollectionData>>;
    });
    const result = await getPage(fixtureImagePageId, { forceRefresh: true });
    assert.equal(reads, mode === "incomplete" || mode === "error" ? 2 : 1);
    const query = result.collection_query[fixtureCollectionId][
      fixtureViewId
    ] as unknown as Record<string, { blockIds: string[] }>;
    assert.deepEqual(
      query["results:select:profile"].blockIds,
      ["first-profile"],
      "a failed follow-up retains the successful first response",
    );
    assert.ok(
      result.block["first-profile"],
      "first-response row blocks survive follow-up failure",
    );
    if (mode === "complete-empty")
      assert.deepEqual(query["results:select:operations"].blockIds, []);
    else
      assert.equal(
        query["results:select:operations"],
        undefined,
        "never fabricate an empty bucket for missing data",
      );
    if (mode === "hidden") {
      const groups = result.collection_view[fixtureViewId].value
        .format as unknown as { collection_groups: Array<{ hidden: boolean }> };
      assert.equal(groups.collection_groups[1].hidden, true);
    }
  });
}

for (const mode of ["missing", "truncated"] as const) {
  void test(`board with ${mode} column metadata must hydrate even with complete buckets`, async (t) => {
    const complete = groupedPage("board");
    const source = structuredClone(complete);
    const query = source.collection_query[fixtureCollectionId][
      fixtureViewId
    ] as unknown as { reducerResults: Record<string, unknown> };
    if (mode === "missing") delete query.reducerResults.board_columns;
    else
      query.reducerResults.board_columns = {
        results: [{ value: { type: "select", value: "profile" }, total: 1 }],
      };
    const key = __pageCacheInternals.getPageCacheKey(fixtureImagePageId);
    t.after(async () => {
      __pageCacheInternals.clear();
      await db.delete(key);
    });
    t.mock.method(notion, "getPage", async () => structuredClone(source));
    let reads = 0;
    t.mock.method(notion, "getCollectionData", async () => {
      reads++;
      return {
        result: complete.collection_query[fixtureCollectionId][fixtureViewId],
        recordMap: structuredClone(complete),
      };
    });
    const refreshed = await getPage(fixtureImagePageId, { forceRefresh: true });
    assert.equal(reads, 1);
    const columns = refreshed.collection_query[fixtureCollectionId][
      fixtureViewId
    ] as unknown as { board_columns: { results: unknown[] } };
    assert.equal(columns.board_columns.results.length, 2);
  });
}

void test("complete all-empty gallery groups avoid collection reads", async (t) => {
  const source = groupedPage();
  const query = source.collection_query[fixtureCollectionId][
    fixtureViewId
  ] as unknown as { reducerResults: Record<string, { blockIds: string[] }> };
  query.reducerResults["results:select:profile"].blockIds = [];
  const key = __pageCacheInternals.getPageCacheKey(fixtureImagePageId);
  t.after(async () => {
    __pageCacheInternals.clear();
    await db.delete(key);
  });
  t.mock.method(notion, "getPage", async () => structuredClone(source));
  let reads = 0;
  t.mock.method(notion, "getCollectionData", async () => {
    reads++;
    return {
      result: source.collection_query[fixtureCollectionId][fixtureViewId],
      recordMap: structuredClone(source),
    };
  });
  const fresh = await getPage(fixtureImagePageId, { forceRefresh: true });
  const cached = await getPage(fixtureImagePageId);
  assert.equal(reads, 0);
  assert.deepEqual(cached, fresh);
  const output = cached.collection_query[fixtureCollectionId][
    fixtureViewId
  ] as unknown as Record<string, { blockIds: string[] }>;
  assert.deepEqual(output["results:select:profile"].blockIds, []);
  assert.deepEqual(output["results:select:operations"].blockIds, []);
});

for (const type of ["gallery", "list", "board"] as const) {
  void test(`complete ${type} groups avoid collection refetch on fresh and cached page reads`, async (t) => {
    const source = groupedPage(type);
    const key = __pageCacheInternals.getPageCacheKey(fixtureImagePageId);
    t.after(async () => {
      __pageCacheInternals.clear();
      await db.delete(key);
    });
    t.mock.method(notion, "getPage", async () => structuredClone(source));
    let collectionReads = 0;
    t.mock.method(notion, "getCollectionData", async () => {
      collectionReads++;
      return {
        result: source.collection_query[fixtureCollectionId][fixtureViewId],
        recordMap: structuredClone(source),
      };
    });
    const fresh = await getPage(fixtureImagePageId, { forceRefresh: true });
    const serializedFresh = JSON.stringify(fresh);
    const cached = await getPage(fixtureImagePageId);
    assert.equal(
      collectionReads,
      0,
      "renderer-ready type/value buckets must not be classified as stale property-ID buckets",
    );
    assert.equal(JSON.stringify(cached), serializedFresh);
    const query = fresh.collection_query[fixtureCollectionId][
      fixtureViewId
    ] as unknown as Record<string, { blockIds: string[] }>;
    assert.deepEqual(query["results:select:profile"].blockIds, [
      fixtureImagePageId,
    ]);
    assert.deepEqual(query["results:select:operations"].blockIds, []);
    assert.deepEqual(
      source,
      groupedPage(type),
      "upstream fixture must not be mutated",
    );
  });
}

void test("a missing visible group bucket still triggers hydration", async (t) => {
  const complete = groupedPage();
  const source = structuredClone(complete);
  const query = source.collection_query[fixtureCollectionId][
    fixtureViewId
  ] as unknown as { reducerResults: Record<string, unknown> };
  delete query.reducerResults["results:select:operations"];
  const key = __pageCacheInternals.getPageCacheKey(fixtureImagePageId);
  t.after(async () => {
    __pageCacheInternals.clear();
    await db.delete(key);
  });
  t.mock.method(notion, "getPage", async () => structuredClone(source));
  let reads = 0;
  t.mock.method(notion, "getCollectionData", async () => {
    reads++;
    return {
      result: complete.collection_query[fixtureCollectionId][fixtureViewId],
      recordMap: structuredClone(complete),
    };
  });
  const refreshed = await getPage(fixtureImagePageId, { forceRefresh: true });
  assert.equal(reads, 1);
  const refreshedQuery = refreshed.collection_query[fixtureCollectionId][
    fixtureViewId
  ] as unknown as Record<string, unknown>;
  assert.ok(Object.hasOwn(refreshedQuery, "results:select:operations"));
});

for (const { name, value, bucketKey } of [
  {
    name: "uncategorized",
    value: { type: "select" },
    bucketKey: "results:select:uncategorized",
  },
  {
    name: "checkbox false",
    value: { type: "checkbox", value: false },
    bucketKey: "results:checkbox:false",
  },
  {
    name: "zero",
    value: { type: "number", value: 0 },
    bucketKey: "results:number:0",
  },
  {
    name: "colon in label",
    value: { type: "select", value: "a:b" },
    bucketKey: "results:select:a:b",
  },
  {
    name: "date range",
    value: { type: "date", value: { range: { start_date: "2026-10-04" } } },
    bucketKey: "results:date:2026-10-04",
  },
]) {
  void test(`renderer bucket for ${name} avoids unnecessary hydration`, async (t) => {
    const source = groupedPage();
    const view = source.collection_view[fixtureViewId].value as unknown as {
      format: { collection_groups: unknown[] };
    };
    view.format.collection_groups = [
      { property: "docType", hidden: false, value },
    ];
    source.collection_query[fixtureCollectionId][fixtureViewId] = {
      reducerResults: {
        [bucketKey]: { type: "results", blockIds: [fixtureImagePageId] },
      },
    } as unknown as ExtendedRecordMap["collection_query"][string][string];
    const key = __pageCacheInternals.getPageCacheKey(fixtureImagePageId);
    t.after(async () => {
      __pageCacheInternals.clear();
      await db.delete(key);
    });
    t.mock.method(notion, "getPage", async () => structuredClone(source));
    let reads = 0;
    t.mock.method(notion, "getCollectionData", async () => {
      reads++;
      return {
        result: source.collection_query[fixtureCollectionId][fixtureViewId],
        recordMap: structuredClone(source),
      };
    });
    const fresh = await getPage(fixtureImagePageId, { forceRefresh: true });
    const serializedFresh = JSON.stringify(fresh);
    const cached = await getPage(fixtureImagePageId);
    assert.equal(reads, 0);
    assert.equal(JSON.stringify(cached), serializedFresh);
    const query = fresh.collection_query[fixtureCollectionId][
      fixtureViewId
    ] as unknown as Record<string, { blockIds: string[] }>;
    assert.deepEqual(query[bucketKey].blockIds, [fixtureImagePageId]);
  });
}

void test("hidden groups do not require result buckets or become visible", async (t) => {
  const source = groupedPage();
  const view = source.collection_view[fixtureViewId].value as unknown as {
    format: { collection_groups: Array<{ hidden: boolean }> };
  };
  view.format.collection_groups[1].hidden = true;
  const query = source.collection_query[fixtureCollectionId][
    fixtureViewId
  ] as unknown as { reducerResults: Record<string, unknown> };
  delete query.reducerResults["results:select:operations"];
  const key = __pageCacheInternals.getPageCacheKey(fixtureImagePageId);
  t.after(async () => {
    __pageCacheInternals.clear();
    await db.delete(key);
  });
  t.mock.method(notion, "getPage", async () => structuredClone(source));
  let reads = 0;
  t.mock.method(notion, "getCollectionData", async () => {
    reads++;
    return { result: query, recordMap: structuredClone(source) };
  });
  const page = await getPage(fixtureImagePageId, { forceRefresh: true });
  assert.equal(reads, 0);
  const rendered = page.collection_view[fixtureViewId]
    .value as unknown as typeof view;
  assert.equal(rendered.format.collection_groups[1].hidden, true);
});

for (const shape of ["aggregate-only", "malformed-visible-bucket"] as const) {
  void test(`${shape} payload still refetches and restores visible group results`, async (t) => {
    const complete = groupedPage();
    const source = structuredClone(complete);
    const bad =
      shape === "aggregate-only"
        ? { collection_group_results: { blockIds: [fixtureImagePageId] } }
        : {
            reducerResults: {
              "results:select:profile": { blockIds: [fixtureImagePageId] },
              "results:select:operations": { blockIds: "invalid" },
            },
          };
    source.collection_query[fixtureCollectionId][fixtureViewId] =
      bad as unknown as ExtendedRecordMap["collection_query"][string][string];
    const key = __pageCacheInternals.getPageCacheKey(fixtureImagePageId);
    t.after(async () => {
      __pageCacheInternals.clear();
      await db.delete(key);
    });
    t.mock.method(notion, "getPage", async () => structuredClone(source));
    let reads = 0;
    t.mock.method(notion, "getCollectionData", async () => {
      reads++;
      return {
        result: complete.collection_query[fixtureCollectionId][fixtureViewId],
        recordMap: structuredClone(complete),
      };
    });
    const page = await getPage(fixtureImagePageId, { forceRefresh: true });
    assert.equal(reads, 1);
    const output = page.collection_query[fixtureCollectionId][
      fixtureViewId
    ] as unknown as Record<string, { blockIds: string[] }>;
    assert.deepEqual(output["results:select:profile"].blockIds, [
      fixtureImagePageId,
    ]);
    assert.deepEqual(output["results:select:operations"].blockIds, []);
  });
}
