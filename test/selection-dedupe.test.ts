import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dedupeSelectionDocuments,
  SelectionUnit,
} from "@/lib/server/chat-guardrails";

describe("dedupeSelectionDocuments", () => {
  const docs = [
    {
      chunk: "chunk-alpha",
      metadata: { doc_id: "doc-1" },
    },
    {
      chunk: "chunk-alpha",
      metadata: { doc_id: "doc-2" },
    },
    {
      chunk: "chunk-bravo",
      metadata: { doc_id: "doc-1" },
    },
    {
      chunk: "chunk-charlie",
      metadata: { doc_id: "doc-3" },
    },
  ];

  it("dedupes chunk-level duplicates and keeps order", () => {
    const result = dedupeSelectionDocuments(docs, (doc) => doc.chunk ?? null, "chunk");
    assert.strictEqual(result.selectionUnit, "chunk");
    assert.strictEqual(result.inputCount, 4);
    assert.strictEqual(result.uniqueBeforeDedupe, 3);
    assert.strictEqual(result.uniqueAfterDedupe, 3);
    assert.strictEqual(result.droppedByDedupe, 1);
    assert.deepStrictEqual(result.dedupedDocs, [docs[0], docs[2], docs[3]]);
  });

  it("dedupes doc-level duplicates correctly", () => {
    const result = dedupeSelectionDocuments(
      docs,
      (doc, index) => doc.metadata?.doc_id ?? `doc:${index}`,
      "doc",
    );
    assert.strictEqual(result.selectionUnit, "doc");
    assert.strictEqual(result.inputCount, 4);
    assert.strictEqual(result.uniqueBeforeDedupe, 3);
    assert.strictEqual(result.uniqueAfterDedupe, 3);
    assert.strictEqual(result.droppedByDedupe, 1);
    assert.deepStrictEqual(result.dedupedDocs, [docs[0], docs[1], docs[3]]);
  });
});
