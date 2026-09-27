// Guards an invariant that only became load-bearing when the traces merged.
//
// LangGraph node names and the names we give our own detail spans used to live
// in separate Langfuse traces, so a collision was invisible. They are now one
// tree, and because observations made through LangfuseTrace parent to the
// request root rather than to the enclosing node span, two spans with the same
// name sit at two depths — indistinguishable when reading a trace, and one of
// them dropped by any consumer that deduplicates by name.
//
// This is the third instance of the same class: `answer:llm` was renamed to
// `answer:summary` before the merge, and `hyde` to `hyde:generate` after it.
// Read from source rather than duplicated here, so the test cannot drift into
// agreeing with itself.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const SOURCES = [
  "lib/server/langchain/rag-retrieval-chain.ts",
  "lib/server/api/chat-stream-answer.ts",
  "lib/server/telemetry/langfuse-answer-summary.ts",
];

async function readSources(): Promise<string> {
  const texts = await Promise.all(
    SOURCES.map((rel) => readFile(path.join(REPO_ROOT, rel), "utf8")),
  );
  return texts.join("\n");
}

function matchAll(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((m) => m[1]!);
}

void describe("telemetry span names", () => {
  void it("gives no LangGraph node the same name as a detail span", async () => {
    const source = await readSources();

    const nodeNames = new Set(matchAll(source, /\.addNode\("([^"]+)"/g));
    const spanNames = new Set(matchAll(source, /\bname: "([^"]+)"/g));

    assert.ok(nodeNames.size > 0, "found no LangGraph nodes — pattern stale?");
    assert.ok(spanNames.size > 0, "found no span names — pattern stale?");

    const collisions = [...spanNames]
      .filter((n) => nodeNames.has(n))
      .toSorted();
    assert.deepEqual(
      collisions,
      [],
      `these names are used by both a LangGraph node and a detail span, so they ` +
        `appear twice at different depths in one trace: ${collisions.join(", ")}`,
    );
  });

  void it("still finds the names it is meant to be checking", async () => {
    // A stale regex would make the test above pass by finding nothing.
    const source = await readSources();
    const nodeNames = matchAll(source, /\.addNode\("([^"]+)"/g);
    const spanNames = matchAll(source, /\bname: "([^"]+)"/g);
    assert.ok(nodeNames.includes("hyde"), "expected a LangGraph node `hyde`");
    assert.ok(
      spanNames.includes("hyde:generate"),
      "expected the detail span `hyde:generate`",
    );
  });
});
