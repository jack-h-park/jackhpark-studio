import assert from "node:assert/strict";
import test from "node:test";

import { applyRanker } from "@/lib/server/rag-enhancements";

const STUB_EMBEDDING_SELECTION = {
  provider: "openai" as const,
  embeddingModelId: "text-embedding-3-small",
  embeddingSpaceId: "openai_te3s_v1",
  model: "text-embedding-3-small",
  version: "v1",
  label: "OpenAI text-embedding-3-small (v1)",
  aliases: [] as readonly string[],
};

const makeDocs = (texts: string[]) =>
  texts.map((chunk, i) => ({ chunk, similarity: 1 - i * 0.1 }));

void test("applyRanker — cohere-rerank", async (t) => {
  await t.test("returns [] when docs is empty", async () => {
    const result = await applyRanker([], {
      mode: "cohere-rerank",
      maxResults: 5,
      embeddingSelection: STUB_EMBEDDING_SELECTION,
      query: "test query",
    });
    assert.deepEqual(result, []);
  });

  await t.test(
    "falls back to vector order when query is missing",
    async () => {
      const docs = makeDocs(["doc A", "doc B", "doc C"]);
      const result = await applyRanker(docs, {
        mode: "cohere-rerank",
        maxResults: 2,
        embeddingSelection: STUB_EMBEDDING_SELECTION,
        query: undefined,
      });
      // No query → fallback: returns first maxResults in original order
      assert.equal(result.length, 2);
      assert.equal(result[0].chunk, "doc A");
      assert.equal(result[1].chunk, "doc B");
    },
  );

  await t.test(
    "falls back to vector order when COHERE_API_KEY is not set",
    async () => {
      // Ensure key is absent
      const saved = process.env.COHERE_API_KEY;
      delete process.env.COHERE_API_KEY;

      try {
        const docs = makeDocs(["doc A", "doc B", "doc C"]);
        const result = await applyRanker(docs, {
          mode: "cohere-rerank",
          maxResults: 2,
          embeddingSelection: STUB_EMBEDDING_SELECTION,
          query: "test query",
        });
        assert.equal(result.length, 2);
        assert.equal(result[0].chunk, "doc A");
        assert.equal(result[1].chunk, "doc B");
      } finally {
        if (saved !== undefined) process.env.COHERE_API_KEY = saved;
      }
    },
  );

  await t.test("respects maxResults clamp to integer >= 1", async () => {
    delete process.env.COHERE_API_KEY;
    const docs = makeDocs(["A", "B", "C", "D", "E"]);
    const result = await applyRanker(docs, {
      mode: "cohere-rerank",
      maxResults: 3.9,
      embeddingSelection: STUB_EMBEDDING_SELECTION,
      query: undefined,
    });
    // trimmedMax = floor(3.9) = 3
    assert.equal(result.length, 3);
  });
});

void test("applyRanker — mode none still works after cohere-ai install", async () => {
  const docs = makeDocs(["X", "Y", "Z"]);
  const result = await applyRanker(docs, {
    mode: "none",
    maxResults: 2,
    embeddingSelection: STUB_EMBEDDING_SELECTION,
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].chunk, "X");
});
