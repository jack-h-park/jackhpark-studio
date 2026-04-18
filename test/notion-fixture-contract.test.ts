import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeNotionRecordMap } from "@/lib/notion/sanitize-record-map";
import {
  chunkByTokens,
  extractPlainText,
  getPageLastEditedTime,
  getPageTitle,
} from "@/lib/rag";
import { extractNotionMetadata } from "@/lib/rag/notion-metadata";

import {
  buildNotionContractRecordMap,
  fixtureCollectionId,
  fixturePageId,
  fixtureViewId,
} from "./fixtures/notion-record-maps";

void describe("Notion fixture contracts", () => {
  void it("extracts page text, title, source timestamp, and metadata", () => {
    const recordMap = buildNotionContractRecordMap();

    assert.equal(
      getPageTitle(recordMap, fixturePageId),
      "Jack H. Park Portfolio",
    );
    assert.equal(
      extractPlainText(recordMap, fixturePageId),
      "Jack H. Park Portfolio\nEnterprise mobility and security background.",
    );
    assert.equal(
      getPageLastEditedTime(recordMap, fixturePageId),
      "2026-04-18T10:00:00.000Z",
    );

    const metadata = extractNotionMetadata(
      sanitizeNotionRecordMap(recordMap),
      fixturePageId,
    );
    assert.equal(metadata.source_type, "notion");
    assert.equal(metadata.doc_type, "profile");
    assert.equal(metadata.persona_type, "professional");
    assert.equal(metadata.is_public, true);
    assert.deepEqual(metadata.tags, ["notion", "rag"]);
  });

  void it("keeps token chunks deterministic and overlapping", () => {
    const chunks = chunkByTokens(
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet",
      4,
      2,
    );

    assert.ok(chunks.length > 1);
    assert.ok(chunks[0].startsWith("alpha"));
    assert.ok(chunks.at(-1)?.includes("juliet"));
  });

  void it("sanitizes malformed collection, view, and block shapes", () => {
    const recordMap = buildNotionContractRecordMap();
    const sanitized = sanitizeNotionRecordMap(recordMap);
    const collection = sanitized.collection?.[fixtureCollectionId]?.value as
      | { schema?: Record<string, { type?: string }> }
      | undefined;
    const view = sanitized.collection_view?.[fixtureViewId]?.value as
      | {
          type?: string;
          format?: {
            table_properties?: Array<{ property?: string; visible?: boolean }>;
            list_properties?: Array<{ property?: string; visible?: boolean }>;
            collection_groups?: Array<{
              value?: { value?: string };
            }>;
          };
        }
      | undefined;

    assert.equal(
      Object.values(collection?.schema ?? {}).some(
        (entry) => entry?.type === "title",
      ),
      true,
    );
    assert.ok(sanitized.collection?.[fixtureCollectionId.replaceAll("-", "")]);

    const viewFormat = view?.format;
    assert.equal(view?.type, "list");
    assert.deepEqual(
      viewFormat?.table_properties?.map((property) => property.property),
      ["title", "docType"],
    );
    assert.deepEqual(
      viewFormat?.list_properties?.map((property) => [
        property.property,
        property.visible,
      ]),
      [
        ["title", false],
        ["docType", true],
      ],
    );
    assert.equal(viewFormat?.collection_groups?.[0]?.value?.value, "profile");
  });
});
