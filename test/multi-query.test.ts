import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeCandidates,
  pickAltQueryType,
} from "@/lib/server/langchain/multi-query";

void test("pickAltQueryType prefers rewrite then hyde", () => {
  assert.equal(
    pickAltQueryType({
      firedRewrite: true,
      firedHyde: true,
      rewriteQuery: "rewrite",
      hydeQuery: "hyde",
    }),
    "rewrite",
  );
  assert.equal(
    pickAltQueryType({
      firedRewrite: false,
      firedHyde: true,
      rewriteQuery: null,
      hydeQuery: "hyde",
    }),
    "hyde",
  );
  assert.equal(
    pickAltQueryType({
      firedRewrite: false,
      firedHyde: false,
      rewriteQuery: "rewrite",
      hydeQuery: "hyde",
    }),
    "none",
  );
});

void test("mergeCandidates keeps higher score for same key", () => {
  const base = [
    {
      docId: "doc-1",
      chunk: "same chunk",
      similarity: 0.4,
      metadata: { doc_id: "doc-1" },
    },
    {
      docId: "doc-2",
      chunk: "unique base",
      similarity: 0.6,
      metadata: { doc_id: "doc-2" },
    },
  ];
  const alt = [
    {
      docId: "doc-1",
      chunk: "same chunk",
      similarity: 0.8,
      metadata: { doc_id: "doc-1" },
    },
  ];

  const merged = mergeCandidates(base as any, alt as any);
  assert.equal(merged.length, 2);
  assert.equal(
    merged.find((item: any) => item.docId === "doc-1")?.similarity,
    0.8,
  );
});

void test("mergeCandidates preserves deterministic ordering on ties", () => {
  const base = [
    {
      docId: "doc-1",
      chunk: "base",
      similarity: 0.5,
      metadata: { doc_id: "doc-1" },
    },
  ];
  const alt = [
    {
      docId: "doc-2",
      chunk: "alt",
      similarity: 0.5,
      metadata: { doc_id: "doc-2" },
    },
  ];

  const merged = mergeCandidates(base as any, alt as any);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].docId, "doc-1");
  assert.equal(merged[1].docId, "doc-2");
});
