import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type ExtendedRecordMap } from "notion-types";

import { readCollectionViewTarget } from "@/lib/get-site-map";
import {
  getBlockValue,
  resolveCollectionDataId,
  unwrapRecordValue,
} from "@/lib/rag/notion-record-value";

const BLOCK_ID = "28299029-c0b4-81ce-8999-d425287d3db6";
const COLLECTION_ID = "28299029-c0b4-81ce-8999-d425287d3db8";
const PARENT_COLLECTION_ID = "28299029-c0b4-81ce-8999-d425287d3dba";
const VIEW_ID = "28299029-c0b4-81ce-8999-d425287d3db9";

// Notion returns the same record in two shapes depending on the endpoint:
// singly nested ({ value: Record }) and doubly nested
// ({ value: { role, value: Record } }). Every table — block, collection,
// collection_view — is affected, which is why one unwrapper serves all three.
const singly = <T>(record: T) => ({ role: "reader", value: record });
const doubly = <T>(record: T) => ({
  role: "reader",
  value: { role: "reader", value: record },
});

void describe("unwrapRecordValue", () => {
  void it("returns a block record from both nesting shapes", () => {
    const block = { id: BLOCK_ID, type: "page", alive: true };

    assert.deepEqual(unwrapRecordValue(singly(block)), block);
    assert.deepEqual(unwrapRecordValue(doubly(block)), block);
  });

  void it("returns a collection_view record from both nesting shapes", () => {
    // Collection views carry an `id` just like blocks do, so the same
    // stop-on-`id` loop terminates at the right level for them.
    const view = {
      id: VIEW_ID,
      type: "list",
      collection_id: COLLECTION_ID,
    };

    assert.deepEqual(unwrapRecordValue(singly(view)), view);
    assert.deepEqual(unwrapRecordValue(doubly(view)), view);
  });

  void it("unwraps a record that carries no id but is still nested", () => {
    // Defensive: a view stripped of its id must not be handed back as the
    // { role, value } wrapper, which would read every field as undefined.
    const view = { type: "list", collection_id: COLLECTION_ID };

    assert.deepEqual(unwrapRecordValue(doubly(view)), view);
  });

  void it("keeps unwrapping past more than one wrapper", () => {
    // The unwrap loops rather than peeling exactly one layer, so an extra
    // wrapper does not strand callers on a { role, value } object.
    const block = { id: BLOCK_ID, type: "page" };

    assert.deepEqual(
      unwrapRecordValue(doubly({ role: "reader", value: block })),
      block,
    );
  });

  void it("stops at the record that owns the id, not at a nested `value` field", () => {
    // A record whose own schema happens to include a `value` property (a
    // rollup/formula column, for instance) must not be unwrapped past its id.
    const record = { id: BLOCK_ID, type: "page", value: { inner: true } };

    assert.deepEqual(unwrapRecordValue(singly(record)), record);
  });

  void it("gives up rather than looping on a self-referential entry", () => {
    // Not a shape Notion returns — the bound exists so a malformed entry
    // cannot hang a build. The implementation folded in from lib/notion.ts
    // capped its own loop for the same reason.
    const cyclic: Record<string, unknown> = { type: "page" };
    cyclic.value = cyclic;

    assert.deepEqual(unwrapRecordValue({ value: cyclic }), cyclic);
  });

  void it("returns undefined for missing, empty, and non-object entries", () => {
    assert.equal(unwrapRecordValue(undefined), undefined);
    assert.equal(unwrapRecordValue(null), undefined);
    assert.equal(unwrapRecordValue({}), undefined);
    assert.equal(unwrapRecordValue({ value: "not-a-record" }), undefined);
  });

  void it("getBlockValue reads through the same unwrapping", () => {
    const block = { id: BLOCK_ID, type: "page" };

    assert.equal(
      getBlockValue(
        doubly(block) as unknown as ExtendedRecordMap["block"][string],
      )?.id,
      BLOCK_ID,
    );
  });
});

const buildRecordMap = (collectionEntry: unknown): ExtendedRecordMap =>
  ({
    collection: { [COLLECTION_ID]: collectionEntry },
  }) as unknown as ExtendedRecordMap;

// resolveCollectionDataId is read by both the sitemap crawl and the page
// renderer. These pin the caller, not just the unwrapper: a stricter or looser
// unwrap shows up here as a lost collection id, which in production means
// inline-database pages silently fall back to UUID URLs.
void describe("resolveCollectionDataId", () => {
  void it("resolveCollectionDataId follows a copied collection's parent, both shapes", () => {
    const copied = {
      id: COLLECTION_ID,
      parent_table: "collection",
      parent_id: PARENT_COLLECTION_ID,
    };

    assert.equal(
      resolveCollectionDataId(buildRecordMap(singly(copied)), COLLECTION_ID),
      PARENT_COLLECTION_ID,
    );
    assert.equal(
      resolveCollectionDataId(buildRecordMap(doubly(copied)), COLLECTION_ID),
      PARENT_COLLECTION_ID,
    );
  });

  void it("resolveCollectionDataId keeps the id for a normal collection", () => {
    const owned = {
      id: COLLECTION_ID,
      parent_table: "block",
      parent_id: BLOCK_ID,
    };

    assert.equal(
      resolveCollectionDataId(buildRecordMap(doubly(owned)), COLLECTION_ID),
      COLLECTION_ID,
    );
    assert.equal(
      resolveCollectionDataId(buildRecordMap(undefined), COLLECTION_ID),
      COLLECTION_ID,
    );
  });

  void it("ignores a parent_id that is empty or not a string", () => {
    // Inherited from the lib/notion.ts implementation this replaced: a copied
    // collection with an unusable parent_id must fall back to its own id
    // rather than issue a queryCollection against "" or an object.
    for (const parent_id of ["", { id: PARENT_COLLECTION_ID }, 42, null]) {
      assert.equal(
        resolveCollectionDataId(
          buildRecordMap(
            doubly({
              id: COLLECTION_ID,
              parent_table: "collection",
              parent_id,
            }),
          ),
          COLLECTION_ID,
        ),
        COLLECTION_ID,
      );
    }
  });
});

void describe("readCollectionViewTarget", () => {
  void it("readCollectionViewTarget finds collection_id in both shapes", () => {
    const view = { id: VIEW_ID, type: "list", collection_id: COLLECTION_ID };

    assert.equal(
      readCollectionViewTarget(singly(view))?.collectionId,
      COLLECTION_ID,
    );
    assert.equal(
      readCollectionViewTarget(doubly(view))?.collectionId,
      COLLECTION_ID,
    );
  });

  void it("readCollectionViewTarget falls back to format.collection_pointer", () => {
    const view = {
      id: VIEW_ID,
      type: "table",
      format: { collection_pointer: { id: COLLECTION_ID } },
    };

    assert.equal(
      readCollectionViewTarget(doubly(view))?.collectionId,
      COLLECTION_ID,
    );
  });

  void it("readCollectionViewTarget strips grouping metadata from the queried view", () => {
    const view = {
      id: VIEW_ID,
      type: "board",
      collection_id: COLLECTION_ID,
      format: {
        collection_group_by: { property: "docType" },
        collection_groups: [],
        board_columns: [],
        board_columns_by: { property: "docType" },
        list_properties: [{ property: "title", visible: true }],
      },
    };

    const target = readCollectionViewTarget(doubly(view));
    assert.ok(target);
    assert.deepEqual(target.flatView.format, {
      list_properties: [{ property: "title", visible: true }],
    });
    assert.equal(
      (target.flatView as { collection_id?: string }).collection_id,
      COLLECTION_ID,
    );
  });

  void it("readCollectionViewTarget returns null when no collection is referenced", () => {
    assert.equal(readCollectionViewTarget(undefined), null);
    assert.equal(
      readCollectionViewTarget(doubly({ id: VIEW_ID, type: "list" })),
      null,
    );
  });
});
