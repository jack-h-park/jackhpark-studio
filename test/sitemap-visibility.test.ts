import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ExtendedRecordMap } from "notion-types";

import {
  buildCanonicalPageMap,
  findVisibilitySchemaProperties,
} from "@/lib/get-site-map";

// Every collection schema property name observed across a full sitemap crawl
// (162 collection entries, measured 2026-08-18). None of them expresses page
// visibility, which is why the sitemap has no visibility filter. If Notion
// grows one, `pnpm check:sitemap-visibility` fails against live data and this
// list is what should be updated alongside the new filter.
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

const collectionId = "28299029-c0b4-81ce-8999-d425287d3db8";

type SchemaEntry = { name: string; type: string };

function schemaFromNames(names: string[]): Record<string, SchemaEntry> {
  return Object.fromEntries(
    names.map((name, index) => [`p${index}`, { name, type: "text" }]),
  );
}

function singleNested(names: string[]): Pick<ExtendedRecordMap, "collection"> {
  return {
    collection: {
      [collectionId]: {
        value: { id: collectionId, schema: schemaFromNames(names) },
      },
    },
  } as unknown as Pick<ExtendedRecordMap, "collection">;
}

// The v3 API this project talks to returns collection records as
// { value: { value, role } }. That extra layer is what silently blinded the
// original "Public" filter, so the detector is tested against both shapes.
function doubleNested(names: string[]): Pick<ExtendedRecordMap, "collection"> {
  return {
    collection: {
      [collectionId]: {
        value: {
          value: { id: collectionId, schema: schemaFromNames(names) },
        },
      },
    },
  } as unknown as Pick<ExtendedRecordMap, "collection">;
}

function pageRecordMap(pageId: string, title: string): ExtendedRecordMap {
  return {
    block: {
      [pageId]: {
        value: {
          id: pageId,
          type: "page",
          properties: { title: [[title]] },
        },
      },
    },
    collection: {},
    collection_view: {},
    collection_query: {},
    notion_user: {},
    signed_urls: {},
  } as unknown as ExtendedRecordMap;
}

void describe("sitemap visibility guard", () => {
  void it("reports nothing for the live Notion schema property set", () => {
    assert.deepEqual(
      findVisibilitySchemaProperties(doubleNested(LIVE_SCHEMA_PROPERTY_NAMES)),
      [],
      "live schemas define no visibility column — if this fails, Notion gained one and the sitemap is ignoring it",
    );
  });

  void it("detects a visibility column in a singly-nested schema", () => {
    assert.deepEqual(
      findVisibilitySchemaProperties(
        singleNested([...LIVE_SCHEMA_PROPERTY_NAMES, "Public"]),
      ),
      ["Public"],
    );
  });

  void it("detects a visibility column through the doubly-nested record shape", () => {
    // Regression guard: the original filter read "Public" off a doubly-nested
    // collection record, found no schema, and silently passed every page.
    assert.deepEqual(
      findVisibilitySchemaProperties(
        doubleNested([...LIVE_SCHEMA_PROPERTY_NAMES, "_is_public"]),
      ),
      ["_is_public"],
    );
  });

  void it("normalizes casing, spacing and underscores in column names", () => {
    for (const name of ["Is Public", "is_public", "PUBLISHED", "_draft"]) {
      assert.deepEqual(
        findVisibilitySchemaProperties(doubleNested([name])),
        [name],
        `expected "${name}" to be recognized as a visibility column`,
      );
    }
  });

  void it("ignores unrelated columns that merely contain a keyword", () => {
    assert.deepEqual(
      findVisibilitySchemaProperties(
        doubleNested(["Public Speaking", "Publication", "Visibility Score"]),
      ),
      [],
    );
  });
});

void describe("buildCanonicalPageMap", () => {
  void it("publishes every page that loaded", () => {
    const pageMap = Object.fromEntries(
      ["a", "b", "c"].map((slug, index) => [
        `2829902${index}-c0b4-81ce-8999-d425287d3db6`,
        pageRecordMap(`2829902${index}-c0b4-81ce-8999-d425287d3db6`, slug),
      ]),
    );

    const canonical = buildCanonicalPageMap(pageMap);

    assert.equal(Object.keys(canonical).length, Object.keys(pageMap).length);
    assert.deepEqual(
      new Set(Object.values(canonical)),
      new Set(Object.keys(pageMap)),
    );
  });

  void it("skips only pages whose recordMap failed to load", () => {
    const loadedId = "28299029-c0b4-81ce-8999-d425287d3db6";
    const failedId = "28299029-c0b4-81ce-8999-d425287d3db7";

    const canonical = buildCanonicalPageMap({
      [loadedId]: pageRecordMap(loadedId, "loaded"),
      [failedId]: null,
    });

    assert.deepEqual(Object.values(canonical), [loadedId]);
  });

  void it("disambiguates rather than drops pages that slugify identically", () => {
    const first = "28299029-c0b4-81ce-8999-d425287d3db6";
    const second = "28299029-c0b4-81ce-8999-d425287d3db7";

    const canonical = buildCanonicalPageMap({
      [first]: pageRecordMap(first, "Same Title"),
      [second]: pageRecordMap(second, "Same Title"),
    });

    assert.equal(Object.keys(canonical).length, 2);
    assert.deepEqual(
      new Set(Object.values(canonical)),
      new Set([first, second]),
    );
  });
});
