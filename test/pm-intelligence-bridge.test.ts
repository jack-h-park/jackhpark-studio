import assert from "node:assert/strict";
import test from "node:test";

import { Raycaster, Vector3 } from "three";

import { createGreenhouseBridge } from "../components/pm-intelligence-world/three/observatoryProps";

void test("the greenhouse connector supplies physical footing along the walking edge", () => {
  const bridge = createGreenhouseBridge();
  bridge.updateMatrixWorld(true);
  for (const z of [-1.4, -0.9, -0.4, 0.1, 0.6, 0.9]) {
    const hits = new Raycaster(
      new Vector3(8, 3.6, z),
      new Vector3(0, -1, 0),
    ).intersectObject(bridge, true);
    assert.ok(
      hits.some((hit) => Math.abs(hit.point.y - 3.3) < 0.05),
      `missing floor at ${z}`,
    );
  }
});
