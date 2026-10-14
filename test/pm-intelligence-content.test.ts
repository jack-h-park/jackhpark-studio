import assert from "node:assert/strict";
import test from "node:test";

import { worldContent } from "@/content/pm-intelligence-world/content";

void test("public map connects several inputs to several uses without invented outcome claims", () => {
  assert.equal(worldContent.inputs.length, 3);
  assert.equal(worldContent.uses.length, 4);
  const ids = new Set(
    [...worldContent.inputs, ...worldContent.uses].map((x) => x.id),
  );
  for (const r of worldContent.relations) {
    assert.ok(ids.has(r.from));
    assert.ok(ids.has(r.to));
    assert.ok(r.explanation);
  }
  assert.ok(
    worldContent.inputs.some(
      (x) => worldContent.relations.filter((r) => r.from === x.id).length > 1,
    ),
  );
  assert.ok(
    worldContent.uses.some(
      (x) => worldContent.relations.filter((r) => r.to === x.id).length > 1,
    ),
  );
  assert.equal(
    worldContent.records.find((x) => x.id === "answer-draft")?.status,
    "observed",
  );
  assert.match(
    worldContent.records.find((x) => x.id === "answer-draft")!.uncertainty,
    /rehears|readiness/i,
  );
  assert.equal(worldContent.decisionExample.status, "illustrative");
});
