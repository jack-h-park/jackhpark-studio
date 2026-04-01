import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyTraceMetadataMerge,
  mergeTraceMetadata,
  type TraceMetadataSnapshot,
} from "@/lib/server/telemetry/trace-metadata-merge";

void describe("mergeTraceMetadata", () => {
  void describe("cache flags — monotonic boolean", () => {
    void it("sets responseHit when previously null", () => {
      const result = mergeTraceMetadata(
        { cache: { responseHit: null, retrievalHit: null } },
        { cache: { responseHit: true, retrievalHit: null } },
      );
      assert.deepEqual(result.cache, { responseHit: true, retrievalHit: null });
    });

    void it("never reverts responseHit from true to false", () => {
      const result = mergeTraceMetadata(
        { cache: { responseHit: true, retrievalHit: null } },
        { cache: { responseHit: false, retrievalHit: null } },
      );
      assert.deepEqual(result.cache, { responseHit: true, retrievalHit: null });
    });

    void it("promotes false when prev is null", () => {
      const result = mergeTraceMetadata(
        { cache: { responseHit: null, retrievalHit: null } },
        { cache: { responseHit: false, retrievalHit: null } },
      );
      assert.deepEqual(result.cache, { responseHit: false, retrievalHit: null });
    });
  });

  void describe("rag flags — monotonic boolean", () => {
    void it("sets retrieval_attempted to true monotonically", () => {
      const result = mergeTraceMetadata(
        { rag: { retrieval_attempted: false } },
        { rag: { retrieval_attempted: true } },
      );
      const rag = result.rag as Record<string, unknown>;
      assert.equal(rag.retrieval_attempted, true);
    });

    void it("never reverts retrieval_attempted from true to false", () => {
      const result = mergeTraceMetadata(
        { rag: { retrieval_attempted: true } },
        { rag: { retrieval_attempted: false } },
      );
      const rag = result.rag as Record<string, unknown>;
      assert.equal(rag.retrieval_attempted, true);
    });

    void it("merges non-monotonic rag subfields normally", () => {
      const result = mergeTraceMetadata(
        { rag: { retrieve_k: 5 } },
        { rag: { final_k: 3 } },
      );
      const rag = result.rag as Record<string, unknown>;
      assert.equal(rag.retrieve_k, 5);
      assert.equal(rag.final_k, 3);
    });
  });

  void describe("intent — first-write-wins", () => {
    void it("sets intent on first write", () => {
      const result = mergeTraceMetadata({}, { intent: "knowledge" });
      assert.equal(result.intent, "knowledge");
    });

    void it("keeps original intent when same value re-written", () => {
      const result = mergeTraceMetadata(
        { intent: "knowledge" },
        { intent: "knowledge" },
      );
      assert.equal(result.intent, "knowledge");
      assert.equal(result.intent_final, undefined);
    });

    void it("records change in intent_final without overwriting original", () => {
      const result = mergeTraceMetadata(
        { intent: "knowledge" },
        { intent: "chitchat" },
      );
      assert.equal(result.intent, "knowledge");
      assert.equal(result.intent_prev, "knowledge");
      assert.equal(result.intent_final, "chitchat");
    });
  });

  void describe("aborted — terminal boolean", () => {
    void it("sets aborted to true", () => {
      const result = mergeTraceMetadata({}, { aborted: true });
      assert.equal(result.aborted, true);
    });

    void it("never reverts aborted from true to false", () => {
      const result = mergeTraceMetadata({ aborted: true }, { aborted: false });
      assert.equal(result.aborted, true);
    });
  });

  void describe("numeric values — monotonic max", () => {
    void it("takes the max of two numeric values", () => {
      const result = mergeTraceMetadata({ count: 3 }, { count: 7 });
      assert.equal(result.count, 7);
    });

    void it("never decreases a numeric counter", () => {
      const result = mergeTraceMetadata({ count: 10 }, { count: 2 });
      assert.equal(result.count, 10);
    });

    void it("sets numeric value when previously absent", () => {
      const result = mergeTraceMetadata({}, { count: 5 });
      assert.equal(result.count, 5);
    });
  });

  void describe("plain objects — deep merge", () => {
    void it("deep merges nested objects", () => {
      const result = mergeTraceMetadata(
        { nested: { a: 1 } },
        { nested: { b: 2 } },
      );
      assert.deepEqual(result.nested, { a: 1, b: 2 });
    });

    void it("replaces non-object prev with merged object", () => {
      const result = mergeTraceMetadata(
        { nested: "old" },
        { nested: { b: 2 } },
      );
      assert.deepEqual(result.nested, { b: 2 });
    });
  });

  void describe("undefined values", () => {
    void it("skips undefined values in next", () => {
      const result = mergeTraceMetadata(
        { a: "existing" },
        { a: undefined },
      );
      assert.equal(result.a, "existing");
    });
  });
});

void describe("applyTraceMetadataMerge", () => {
  void it("mutates target in place", () => {
    const target: TraceMetadataSnapshot = { intent: "knowledge" };
    applyTraceMetadataMerge(target, { aborted: true });
    assert.equal(target.intent, "knowledge");
    assert.equal(target.aborted, true);
  });

  void it("is a no-op when target is null", () => {
    assert.doesNotThrow(() => applyTraceMetadataMerge(null, { a: 1 }));
  });

  void it("is a no-op when target is undefined", () => {
    assert.doesNotThrow(() => applyTraceMetadataMerge(undefined, { a: 1 }));
  });
});
