import assert from "node:assert";
import { describe, it } from "node:test";

import {
  computeDocumentStats,
  type RagDocumentRecord,
} from "@/lib/admin/rag-documents";

function buildDoc(
  docId: string,
  metadata: RagDocumentRecord["metadata"],
): RagDocumentRecord {
  return {
    doc_id: docId,
    raw_doc_id: null,
    source_url: null,
    last_ingested_at: null,
    last_source_update: null,
    chunk_count: null,
    total_characters: null,
    metadata,
  };
}

void describe("computeDocumentStats", () => {
  void it("counts metadata.public when present and falls back to metadata.is_public", () => {
    const documents: RagDocumentRecord[] = [
      buildDoc("public-true", { public: true }),
      buildDoc("public-false", { public: false }),
      buildDoc("fallback-public-true", { is_public: true }),
      buildDoc("fallback-public-false", { is_public: false }),
      buildDoc("public-prioritized", { public: true, is_public: false }),
    ];

    const stats = computeDocumentStats(documents);

    assert.strictEqual(stats.publicCount, 3);
    assert.strictEqual(stats.privateCount, 2);
  });
});
