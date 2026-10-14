import assert from "node:assert/strict";
import test from "node:test";

import { sectionIds } from "@/content/pm-intelligence-world/types";
import { sceneLayout } from "@/lib/pm-intelligence-world/scene-layout";

void test("all content sections have finite scene targets and decision is outside the commons", () => {
  for (const id of sectionIds) {
    assert.equal(sceneLayout[id].position.length, 3);
    assert.ok(
      [...sceneLayout[id].position, ...sceneLayout[id].camera].every(
        Number.isFinite,
      ),
    );
  }
  assert.notDeepEqual(
    sceneLayout.decisions.position,
    sceneLayout.knowledge.position,
  );
  assert.equal(sceneLayout.knowledge.position[0], 0);
});
