import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type ExtendedRecordMap } from "notion-types";

import { pageAcl } from "@/lib/acl";
import { findUnhonouredVisibilityProperties } from "@/lib/get-site-map";
import { extractNotionMetadata } from "@/lib/rag/notion-metadata";
import { normalizeNotionRecordMap } from "@/lib/rag/notion-record-value";

import {
  buildNotionContractRecordMap,
  fixturePageId,
} from "./fixtures/notion-record-maps";

const PAGE_ID = "28299029-c0b4-81ce-8999-d425287d3dd0";
const COLLECTION_ID = "28299029-c0b4-81ce-8999-d425287d3dd1";
const PROPERTY_KEY = "aB>c";

// Every collection schema property name observed across a full sitemap crawl
// (162 collection entries, measured 2026-08-18). None of them is a visibility
// column: the personal-vs-public split the old "Public" filter belonged to was
// replaced by `_persona_type`, which is a ranking weight, not a gate.
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

void describe("visibility columns the website ignores", () => {
  void it("finds nothing in the live property-name set", () => {
    assert.deepEqual(
      findUnhonouredVisibilityProperties(
        collectionWithColumns(LIVE_SCHEMA_PROPERTY_NAMES),
      ),
      [],
    );
  });

  void it("flags a visibility column under any name, including _is_public", () => {
    // The website honours none of them. `_is_public` is flagged too: ingestion
    // reads it for chat retrieval, but the sitemap does not, and a column that
    // hides a document from the assistant while the page stays published is
    // worth knowing about.
    assert.deepEqual(
      findUnhonouredVisibilityProperties(
        collectionWithColumns(["Public", "Draft", "_is_public", "Tags"]),
      ),
      ["Draft", "Public", "_is_public"],
    );
  });

  void it("reads through the doubly-nested collection shape", () => {
    // The fixtures here are doubly nested on purpose: that extra layer is what
    // blinded the original filter, so a detector that cannot see through it
    // would report "all clear" on live data.
    assert.deepEqual(
      findUnhonouredVisibilityProperties(
        collectionWithColumns(["Is Published"]),
      ),
      ["Is Published"],
    );
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

// What retirement means, pinned: the website publishes and serves a page no
// matter what a visibility column says. The previous behaviour — de-list in
// the sitemap, 404 at the URL — is gone, in both halves.
void describe("the website ignores _is_public", () => {
  const site = {
    domain: "example.com",
    rootNotionSpaceId: null,
  } as unknown as Parameters<typeof pageAcl>[0]["site"];

  void it("serves a page whose box is unchecked", async () => {
    const recordMap = buildRow({ column: "_is_public", value: "false" });

    assert.equal(
      await pageAcl({ site, recordMap, pageId: PAGE_ID }),
      undefined,
    );
  });

  void it("serves a page with no such column", async () => {
    const recordMap = buildRow({ column: "Category", value: "false" });

    assert.equal(
      await pageAcl({ site, recordMap, pageId: PAGE_ID }),
      undefined,
    );
  });
});

// The other half is untouched: ingestion still records the flag, and chat
// retrieval still drops documents marked private in the admin editor.
void describe("ingestion still records _is_public", () => {
  void it("reads the checkbox into document metadata", () => {
    assert.equal(
      extractNotionMetadata(
        buildRow({ column: "_is_public", value: "false" }),
        PAGE_ID,
      ).is_public,
      false,
    );
  });

  void it("agrees with the shared Notion fixture", () => {
    const recordMap = normalizeNotionRecordMap(buildNotionContractRecordMap());

    assert.equal(
      extractNotionMetadata(recordMap, fixturePageId).is_public,
      true,
    );
  });
});
