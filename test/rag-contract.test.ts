import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildResponseCacheKeyPayload,
  buildRetrievalCacheKey,
  computeHistorySummaryHash,
} from "@/lib/server/api/chat-cache-keys";
import { hashPayload } from "@/lib/server/chat-cache";
import {
  buildContextWindow,
  type RagDocument,
} from "@/lib/server/chat-guardrails";
import { buildCitationPayload } from "@/lib/types/citation";

import {
  buildTestGuardrails,
  buildTestResponseCacheArgs,
  buildTestRetrievalCacheArgs,
} from "./helpers/chat-builders";

const candidateDocs: RagDocument[] = [
  {
    chunk:
      "Jack led enterprise mobility and security work across regulated customer environments.",
    similarity: 0.91,
    metadata_weight: 1.15,
    metadata: {
      doc_id: "profile",
      title: "Profile",
      source_url: "https://example.com/profile",
      doc_type: "profile",
      persona_type: "expert",
    },
  },
  {
    chunk:
      "Jack led enterprise mobility and security work across regulated customer environments.",
    similarity: 0.89,
    metadata_weight: 1.15,
    metadata: {
      doc_id: "profile-duplicate",
      title: "Duplicate Profile",
      source_url: "https://example.com/duplicate",
      doc_type: "profile",
      persona_type: "expert",
    },
  },
  {
    chunk:
      "The assistant uses retrieval traces, citations, and telemetry to explain portfolio content.",
    similarity: 0.82,
    metadata_weight: 1.1,
    metadata: {
      doc_id: "rag-system",
      title: "RAG System",
      source_url: "https://example.com/rag",
      doc_type: "kb",
      persona_type: "expert",
    },
  },
];

void describe("RAG contract fixtures", () => {
  void it("builds context windows with citations for every selected document", () => {
    const context = buildContextWindow(
      candidateDocs,
      buildTestGuardrails({
        ragTopK: 2,
        similarityThreshold: 0.4,
        ragContextTokenBudget: 512,
      }),
      { includeSelectionMetadata: true },
    );
    const citationPayload = buildCitationPayload(context.included, {
      topKChunks: context.included.length,
    });

    assert.equal(context.insufficient, false);
    assert.equal(context.included.length, 2);
    assert.equal(context.selection?.droppedByDedupe, 1);
    assert.equal(citationPayload.citations.length, 2);
    assert.deepEqual(
      citationPayload.citations.map((citation) => citation.docId),
      ["profile", "rag-system"],
    );
  });

  void it("captures cache key dimensions that affect RAG behavior", () => {
    const responseKey = hashPayload(
      buildResponseCacheKeyPayload(
        buildTestResponseCacheArgs({
          summaryHash: computeHistorySummaryHash(null),
        }),
      ),
    );
    const changedModelKey = hashPayload(
      buildResponseCacheKeyPayload(
        buildTestResponseCacheArgs({
          resolvedModelId: "gpt-4o-mini",
          summaryHash: computeHistorySummaryHash(null),
        }),
      ),
    );
    const retrievalKey = buildRetrievalCacheKey(buildTestRetrievalCacheArgs());
    const changedRetrievalKey = buildRetrievalCacheKey(
      buildTestRetrievalCacheArgs({
        hydeEnabled: true,
        hydeMode: "auto",
      }),
    );

    assert.notEqual(responseKey, changedModelKey);
    assert.notEqual(retrievalKey, changedRetrievalKey);
  });
});
