import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractPlainText } from "@/lib/rag";

import {
  buildCodeBlockRecordMap,
  fixturePageId,
} from "./fixtures/notion-record-maps";

void describe("extractPlainText and code blocks", () => {
  void it("leaves Mermaid diagram source out of the indexed text", () => {
    const text = extractPlainText(buildCodeBlockRecordMap(), fixturePageId);

    assert.ok(!text.includes("flowchart LR"), text);
    assert.ok(!text.includes("-->"), text);
    assert.ok(text.includes("Enterprise mobility and security background."));
  });

  void it("keeps an ordinary code block", () => {
    const text = extractPlainText(buildCodeBlockRecordMap(), fixturePageId);

    assert.ok(text.includes("const answer = 42;"), text);
  });

  void it("matches the language the way the renderer does: trimmed, any case", () => {
    const text = extractPlainText(
      buildCodeBlockRecordMap("  mermaid "),
      fixturePageId,
    );

    assert.ok(!text.includes("flowchart LR"), text);
  });
});
