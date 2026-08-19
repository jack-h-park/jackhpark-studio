import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { resolveRagMatchRpcVersion } from "@/lib/core/rag-match-version";
import { getLcMatchFunction, getRagMatchFunction } from "@/lib/core/rag-tables";
import {
  getLcChunksViewName,
  getMatchChunksFunctionName,
  getMatchLcChunksFunctionName,
  getMatchRpcSpaceBase,
} from "@/lib/shared/models";

const SPACES = ["openai_te3s_v1", "gemini_te4_v1"] as const;

const V2_MIGRATION = readFileSync(
  path.join(process.cwd(), "db/migrations/20260215_rag_match_v2.sql"),
  "utf8",
);

function withRpcVersion<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.RAG_MATCH_RPC_VERSION;
  if (value === undefined) {
    delete process.env.RAG_MATCH_RPC_VERSION;
  } else {
    process.env.RAG_MATCH_RPC_VERSION = value;
  }
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.RAG_MATCH_RPC_VERSION;
    } else {
      process.env.RAG_MATCH_RPC_VERSION = previous;
    }
  }
}

void describe("rag match RPC naming", () => {
  void it("keeps the v1 names byte-identical to what shipped", () => {
    // Every deployment still on the default must keep naming the functions it always named.
    assert.equal(
      getMatchLcChunksFunctionName("openai_te3s_v1"),
      "match_langchain_chunks_openai_te3s_v1",
    );
    assert.equal(
      getMatchLcChunksFunctionName("gemini_te4_v1"),
      "match_langchain_chunks_gemini_te4_v1",
    );
    assert.equal(
      getMatchChunksFunctionName("openai_te3s_v1"),
      "match_native_chunks_openai_te3s_v1",
    );
  });

  void it("derives v2 names that the migration actually defines", () => {
    // Binding the derivation to the SQL is the point: a name the database does not define is
    // not a naming bug, it is a failed query at request time.
    for (const space of SPACES) {
      for (const derived of [
        getMatchLcChunksFunctionName(space, "2"),
        getMatchChunksFunctionName(space, "2"),
      ]) {
        assert.ok(
          V2_MIGRATION.includes(`"public"."${derived}"`),
          `${derived} is derived by the code but not defined in 20260215_rag_match_v2.sql`,
        );
      }
    }
  });

  void it("reads the same per-space view at both RPC generations", () => {
    // The RPC generation changes the filter, not the corpus: v2's body selects from the v1
    // view, so the view name must stay keyed on the full space id.
    for (const space of SPACES) {
      const view = getLcChunksViewName(space);
      assert.equal(view, `lc_chunks_${space}`);
      assert.ok(
        V2_MIGRATION.includes(`public.${view}`),
        `${view} is not the view the v2 functions read from`,
      );
    }
  });

  void it("lets the chat path select v2 through the environment", () => {
    withRpcVersion("2", () => {
      assert.equal(resolveRagMatchRpcVersion(), "2");
      assert.equal(
        getLcMatchFunction("openai"),
        "match_langchain_chunks_openai_te3s_v2",
      );
      assert.equal(
        getRagMatchFunction("gemini"),
        "match_native_chunks_gemini_te4_v2",
      );
    });
  });

  void it("defaults to the unfiltered v1 generation", () => {
    for (const value of [undefined, "", "1", "v2", "true"]) {
      withRpcVersion(value, () => {
        assert.equal(resolveRagMatchRpcVersion(), "1");
        assert.equal(
          getLcMatchFunction("openai"),
          "match_langchain_chunks_openai_te3s_v1",
        );
      });
    }
  });

  void it("refuses to derive a name for a second embedding-space generation", () => {
    // Stripping the space version separates the two axes but does not make the result
    // unique. Space `openai_te3s_v2` strips to the same base as `openai_te3s_v1`, so at RPC
    // v2 it would resolve to the v1 space's filtered function — the right table through the
    // wrong filter, with no error. Fail at derivation instead.
    assert.equal(getMatchRpcSpaceBase("openai_te3s_v1"), "openai_te3s");
    assert.throws(
      () => getMatchRpcSpaceBase("openai_te3s_v2"),
      /unambiguous RPC naming scheme/,
    );
    assert.throws(
      () => getMatchLcChunksFunctionName("openai_te3s_v2", "2"),
      /generation v2/,
    );
  });
});
