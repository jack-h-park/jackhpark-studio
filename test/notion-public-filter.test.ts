import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type ExtendedRecordMap } from "notion-types";

import { pageAcl } from "@/lib/acl";
import { findUnhonouredVisibilityProperties } from "@/lib/get-site-map";
import {
  extractNotionMetadata,
  getNotionPageIsPublic,
  NOTION_IS_PUBLIC_PROPERTY,
} from "@/lib/rag/notion-metadata";
import { normalizeNotionRecordMap } from "@/lib/rag/notion-record-value";

import {
  buildNotionContractRecordMap,
  fixturePageId,
} from "./fixtures/notion-record-maps";

const PAGE_ID = "28299029-c0b4-81ce-8999-d425287d3dd0";
const COLLECTION_ID = "28299029-c0b4-81ce-8999-d425287d3dd1";
const PROPERTY_KEY = "aB>c";

// The shape the live crawl returns: collection entries are doubly nested, and
// a row's properties are keyed by schema id, not by property name.
function buildRow({
  column,
  value,
}: {
  column?: string;
  value?: string;
}): ExtendedRecordMap {
  return normalizeNotionRecordMap({
    block: {
      [PAGE_ID]: {
        role: "reader",
        value: {
          id: PAGE_ID,
          type: "page",
          parent_table: "collection",
          parent_id: COLLECTION_ID,
          properties: {
            title: [["Architecture Notes"]],
            ...(value === undefined ? {} : { [PROPERTY_KEY]: [[value]] }),
          },
        },
      },
    },
    collection: {
      [COLLECTION_ID]: {
        role: "reader",
        value: {
          role: "reader",
          value: {
            id: COLLECTION_ID,
            schema: {
              title: { name: "Name", type: "title" },
              ...(column === undefined
                ? {}
                : { [PROPERTY_KEY]: { name: column, type: "checkbox" } }),
            },
          },
        },
      },
    },
  } as unknown as ExtendedRecordMap);
}

void describe("_is_public visibility", () => {
  void it("reads an unchecked box as not publishable", () => {
    const recordMap = buildRow({
      column: NOTION_IS_PUBLIC_PROPERTY,
      value: "false",
    });

    assert.equal(getNotionPageIsPublic(recordMap, PAGE_ID), false);
  });

  void it("reads a checked box as publishable", () => {
    const recordMap = buildRow({
      column: NOTION_IS_PUBLIC_PROPERTY,
      value: "true",
    });

    assert.equal(getNotionPageIsPublic(recordMap, PAGE_ID), true);
  });

  void it("returns undefined when the collection has no such column", () => {
    // Today's live state: no collection in the workspace defines the column,
    // so every page reads undefined. The crawl excludes only an explicit
    // false, which is what keeps all 156 pages published.
    const recordMap = buildRow({ column: "Category", value: "false" });

    assert.equal(getNotionPageIsPublic(recordMap, PAGE_ID), undefined);
    assert.notEqual(getNotionPageIsPublic(recordMap, PAGE_ID), false);
  });

  void it("returns undefined when the row leaves the box empty", () => {
    const recordMap = buildRow({ column: NOTION_IS_PUBLIC_PROPERTY });

    assert.equal(getNotionPageIsPublic(recordMap, PAGE_ID), undefined);
  });

  void it("cannot read a collection table that was left doubly nested", () => {
    // Why the crawl must normalize before filtering: the schema is
    // unreachable, so the lookup comes back undefined and the page publishes
    // regardless of the box. Pinned so a change that drops normalization
    // shows up as a visibility bug rather than silence.
    const normalized = buildRow({
      column: NOTION_IS_PUBLIC_PROPERTY,
      value: "false",
    });
    const raw = {
      ...normalized,
      collection: {
        [COLLECTION_ID]: {
          role: "reader",
          value: {
            role: "reader",
            value: normalized.collection[COLLECTION_ID].value,
          },
        },
      },
    } as unknown as ExtendedRecordMap;

    assert.equal(getNotionPageIsPublic(raw, PAGE_ID), undefined);
    assert.equal(getNotionPageIsPublic(normalized, PAGE_ID), false);
  });

  // The bug this replaced: the site filtered on "Public" while ingestion wrote
  // `_is_public`. Two names for one idea, and the site's name matched nothing.
  void it("the site filter and RAG ingestion read the same property", () => {
    const recordMap = buildRow({
      column: NOTION_IS_PUBLIC_PROPERTY,
      value: "false",
    });

    assert.equal(
      extractNotionMetadata(recordMap, PAGE_ID).is_public,
      getNotionPageIsPublic(recordMap, PAGE_ID),
    );
    assert.equal(extractNotionMetadata(recordMap, PAGE_ID).is_public, false);
  });

  void it("agrees with the shared Notion fixture", () => {
    // Normalized first, like every other consumer of this fixture: its
    // collection entry is doubly nested, exactly as Notion returns it.
    const recordMap = normalizeNotionRecordMap(buildNotionContractRecordMap());

    assert.equal(getNotionPageIsPublic(recordMap, fixturePageId), true);
    assert.equal(
      extractNotionMetadata(recordMap, fixturePageId).is_public,
      true,
    );
  });
});

// Every collection schema property name observed across a full sitemap crawl
// (162 collection entries, measured 2026-08-18). None of them is a visibility
// column, which is why nothing is excluded today. If Notion grows one under a
// name the crawl does not read, `pnpm check:sitemap-visibility` fails against
// live data.
const LIVE_SCHEMA_PROPERTY_NAMES = [
  "Capability Type",
  "Category",
  "Created",
  "Date",
  "Degree & Major",
  "Environment",
  "Ex Level",
  "Level of expertise",
  "LinkedIn Post URL",
  "Name",
  "Period",
  "Posted on",
  "Role",
  "Status",
  "Tags",
  "Tool Type",
  "URL",
  "Website",
  "_doc_type",
  "_persona_type",
];

function collectionWithColumns(names: string[]) {
  return {
    collection: {
      [COLLECTION_ID]: {
        role: "reader",
        value: {
          role: "reader",
          value: {
            id: COLLECTION_ID,
            schema: Object.fromEntries(
              names.map((name, i) => [`p${i}`, { name, type: "text" }]),
            ),
          },
        },
      },
    },
  } as unknown as ExtendedRecordMap;
}

void describe("unhonoured visibility columns", () => {
  void it("finds nothing in the live property-name set", () => {
    assert.deepEqual(
      findUnhonouredVisibilityProperties(
        collectionWithColumns(LIVE_SCHEMA_PROPERTY_NAMES),
      ),
      [],
    );
  });

  void it("ignores the column the crawl does honour", () => {
    assert.deepEqual(
      findUnhonouredVisibilityProperties(
        collectionWithColumns([NOTION_IS_PUBLIC_PROPERTY, "Tags"]),
      ),
      [],
    );
  });

  void it("flags a visibility column under any other name", () => {
    // Including "Public" — the name that shipped the original dead filter.
    assert.deepEqual(
      findUnhonouredVisibilityProperties(
        collectionWithColumns(["Public", "Draft", "Tags"]),
      ),
      ["Draft", "Public"],
    );
  });

  void it("reads through the doubly-nested collection shape", () => {
    // The fixtures above are doubly nested on purpose: that extra layer is
    // what blinded the original filter, so a detector that cannot see through
    // it would report "all clear" on live data.
    const found = findUnhonouredVisibilityProperties(
      collectionWithColumns(["Is Published"]),
    );
    assert.deepEqual(found, ["Is Published"]);
  });

  void it("does not flag near-misses", () => {
    assert.deepEqual(
      findUnhonouredVisibilityProperties(
        collectionWithColumns(["Public Speaking", "Publication", "Publisher"]),
      ),
      [],
    );
  });
});

// De-listing is not hiding: resolveNotionPage serves a page directly whenever
// the URL carries its id, never consulting canonicalPageMap. The gate has to
// sit on the path every resolution takes.
void describe("page gating", () => {
  const site = {
    domain: "example.com",
    rootNotionSpaceId: null,
  } as unknown as Parameters<typeof pageAcl>[0]["site"];

  void it("404s a page whose box is unchecked", async () => {
    const recordMap = buildRow({
      column: NOTION_IS_PUBLIC_PROPERTY,
      value: "false",
    });

    const result = await pageAcl({ site, recordMap, pageId: PAGE_ID });
    assert.equal(result?.error?.statusCode, 404);
  });

  void it("serves a page whose box is checked", async () => {
    const recordMap = buildRow({
      column: NOTION_IS_PUBLIC_PROPERTY,
      value: "true",
    });

    assert.equal(
      await pageAcl({ site, recordMap, pageId: PAGE_ID }),
      undefined,
    );
  });

  void it("serves a page with no such column", async () => {
    // Today's live state for all 156 pages.
    const recordMap = buildRow({ column: "Category", value: "false" });

    assert.equal(
      await pageAcl({ site, recordMap, pageId: PAGE_ID }),
      undefined,
    );
  });
});
