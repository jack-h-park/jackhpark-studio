import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRetrievalTelemetryEntries } from "@/lib/server/chat-common";
import { decideTelemetryMode } from "@/lib/telemetry/chat-langfuse";

const always = (value: number) => () => value;

void describe("decideTelemetryMode", () => {
  void it("disables tracing when sampleRate is zero", () => {
    const decision = decideTelemetryMode(0, "standard", always(0.5));
    assert.equal(decision.shouldEmitTrace, false);
    assert.equal(decision.includeConfigSnapshot, false);
    assert.equal(decision.includeRetrievalDetails, false);
  });

  void it("always emits when sampleRate is one", () => {
    const decision = decideTelemetryMode(1, "standard", always(0.9));
    assert.equal(decision.shouldEmitTrace, true);
    assert.equal(decision.includeConfigSnapshot, true);
    assert.equal(decision.includeRetrievalDetails, false);
  });

  void it("emits when random sample is below threshold", () => {
    const decision = decideTelemetryMode(0.1, "minimal", always(0.05));
    assert.equal(decision.shouldEmitTrace, true);
    assert.equal(decision.includeConfigSnapshot, false);
    assert.equal(decision.includeRetrievalDetails, false);
  });

  void it("skips when random sample exceeds threshold", () => {
    const decision = decideTelemetryMode(0.1, "verbose", always(0.5));
    assert.equal(decision.shouldEmitTrace, false);
    assert.equal(decision.includeConfigSnapshot, false);
    assert.equal(decision.includeRetrievalDetails, false);
  });

  void it("honors detail level for config snapshot and retrieval details", () => {
    const minimal = decideTelemetryMode(1, "minimal", always(0.5));
    assert.equal(minimal.includeConfigSnapshot, false);
    assert.equal(minimal.includeRetrievalDetails, false);

    const standard = decideTelemetryMode(1, "standard", always(0.5));
    assert.equal(standard.includeConfigSnapshot, true);
    assert.equal(standard.includeRetrievalDetails, false);

    const verbose = decideTelemetryMode(1, "verbose", always(0.5));
    assert.equal(verbose.includeConfigSnapshot, true);
    assert.equal(verbose.includeRetrievalDetails, true);
  });

  void it("forces tracing when requested", () => {
    const decision = decideTelemetryMode(
      0,
      "verbose",
      always(0.9),
      true,
    );
    assert.equal(decision.shouldEmitTrace, true);
    assert.equal(decision.includeRetrievalDetails, true);
  });
});

void describe("buildRetrievalTelemetryEntries", () => {
  void it("limits entries and normalizes the common fields", () => {
    const docs = [
      {
        docId: "first-doc",
        baseSimilarity: 0.9,
        similarity: 0.95,
        metadata_weight: 0.2,
        metadata: {
          doc_type: "article",
          persona_type: "persona",
          is_public: true,
        },
      },
      {
        doc_id: "second-doc",
        similarity: 0.5,
        metadata_weight: 0.3,
        metadata: {
          doc_type: "note",
          persona_type: "assistant",
        },
      },
    ];
    const entries = buildRetrievalTelemetryEntries(docs, 1);
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0], {
      doc_id: "first-doc",
      similarity: 0.9,
      weight: 0.2,
      finalScore: 0.95,
      doc_type: "article",
      persona_type: "persona",
      is_public: true,
    });
  });

  void it("falls back to alternate doc identifiers and metadata weight", () => {
    const docs = [
      {
        document_id: "legacy-doc",
        similarity: 0.33,
        metadata: {
          docType: "legacy-type",
          personaType: "legacy-persona",
          weight: 0.4,
        },
      },
    ];
    const entries = buildRetrievalTelemetryEntries(docs, 5);
    assert.deepEqual(entries[0], {
      doc_id: "legacy-doc",
      similarity: 0.33,
      weight: 0.4,
      finalScore: 0.33,
      doc_type: "legacy-type",
      persona_type: "legacy-persona",
      is_public: null,
    });
  });
});
