import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ExtendedRecordMap } from "notion-types";

import { hasKaTeXContent } from "@/lib/notion-katex";

function buildRecordMap(
  blockValue: Record<string, unknown>,
): ExtendedRecordMap {
  return {
    block: {
      block_id: {
        value: {
          id: "block_id",
          ...blockValue,
        },
      },
    },
  } as unknown as ExtendedRecordMap;
}

void describe("hasKaTeXContent", () => {
  void it("detects equation blocks", () => {
    const recordMap = buildRecordMap({
      type: "equation",
      properties: {},
    });

    assert.equal(hasKaTeXContent(recordMap), true);
  });

  void it("detects inline equation decorations", () => {
    const recordMap = buildRecordMap({
      type: "text",
      properties: {
        title: [["x + y", [["e", "x + y"]]]],
      },
    });

    assert.equal(hasKaTeXContent(recordMap), true);
  });

  void it("detects common LaTeX-like fragments in text", () => {
    const recordMap = buildRecordMap({
      type: "text",
      properties: {
        title: [["The area is \\frac{1}{2}bh"]],
      },
    });

    assert.equal(hasKaTeXContent(recordMap), true);
  });

  void it("ignores normal Notion text", () => {
    const recordMap = buildRecordMap({
      type: "text",
      properties: {
        title: [["Regular portfolio copy without math."]],
      },
    });

    assert.equal(hasKaTeXContent(recordMap), false);
  });
});
