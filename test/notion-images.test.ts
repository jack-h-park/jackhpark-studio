import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractNotionPageImages } from "@/lib/rag/notion-images";
import { normalizeNotionRecordMap } from "@/lib/rag/notion-record-value";

import {
  buildImagePageRecordMap,
  fixtureImageBlockId,
  fixtureImagePageId,
  fixtureSecondImageBlockId,
} from "./fixtures/notion-record-maps";

void describe("extractNotionPageImages", () => {
  void it("extracts images in document order with caption context", () => {
    const images = extractNotionPageImages(
      buildImagePageRecordMap(),
      fixtureImagePageId,
    );

    assert.equal(images.length, 2);

    const [first, second] = images;
    assert.equal(first!.blockId, fixtureImageBlockId);
    assert.equal(first!.url, "https://example.com/pipeline-diagram.png");
    assert.equal(first!.notionCaption, "Figure 1: retrieval fan-out");
    assert.equal(first!.nearestHeading, "Retrieval Pipeline");
    assert.equal(first!.precedingText, "The pipeline fans out per chunk.");
    assert.equal(first!.orderIndex, 0);

    assert.equal(second!.blockId, fixtureSecondImageBlockId);
    assert.equal(second!.url, "https://example.com/screenshot.png");
    assert.equal(second!.notionCaption, null);
    // Context carries forward: still under the same heading/paragraph.
    assert.equal(second!.nearestHeading, "Retrieval Pipeline");
    assert.equal(second!.orderIndex, 1);
  });

  void it("survives doubly-nested record maps once normalized", () => {
    const base = buildImagePageRecordMap();
    const doublyNested = {
      ...base,
      block: Object.fromEntries(
        Object.entries(base.block).map(([id, entry]) => [
          id,
          { value: { role: "reader", value: entry.value } },
        ]),
      ),
    } as unknown as typeof base;

    const images = extractNotionPageImages(
      normalizeNotionRecordMap(doublyNested),
      fixtureImagePageId,
    );
    assert.equal(images.length, 2);
  });

  void it("returns an empty list for pages without images", () => {
    const base = buildImagePageRecordMap();
    const pageBlock = base.block[fixtureImagePageId]!.value as unknown as {
      content: string[];
    };
    pageBlock.content = [];

    assert.deepEqual(extractNotionPageImages(base, fixtureImagePageId), []);
  });
});
