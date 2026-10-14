import assert from "node:assert/strict";
import test from "node:test";

import { Color, Mesh, PerspectiveCamera } from "three";

import {
  createStation,
  resolveStationId,
} from "@/components/pm-intelligence-world/three/stations";
import { sectionIds } from "@/content/pm-intelligence-world/types";
import {
  projectSceneLabel,
 resolveLabelLayout,  spatialLabels } from "@/lib/pm-intelligence-world/scene-labels";
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
void test("spatial labels follow the camera and hide offscreen targets", () => {
  const camera = new PerspectiveCamera(45, 2, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  assert.deepEqual(
    projectSceneLabel([0, 0, 0], camera, { width: 600, height: 300 }),
    { x: 300, y: 150, visible: true },
  );
  assert.equal(
    projectSceneLabel([0, 0, 20], camera, { width: 600, height: 300 }).visible,
    false,
  );
  assert.equal(
    projectSceneLabel([100, 0, 0], camera, { width: 600, height: 300 }).visible,
    false,
  );
  assert.equal(
    projectSceneLabel([0, 0, 0], camera, { width: 0, height: 0 }).visible,
    false,
  );
  assert.equal(
    spatialLabels.find((x) => x.id === "decisions")?.qualifier,
    "On request",
  );
});
void test("clicking nested station objects selects their content instead of requiring the platform base", () => {
  const station = createStation("writing", new Color("cyan"));
  let object: Mesh | undefined;
  station.traverse((node) => {
    if (node instanceof Mesh) object = node;
  });
  assert.ok(object);
  assert.equal(resolveStationId(object), "writing");
  assert.equal(resolveStationId(new Mesh()), null);
});
void test("crowded spatial labels stay inside the viewport without covering each other", () => {
  const positions = resolveLabelLayout(
    Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      x: 180,
      y: 160,
      width: 100,
      height: 44,
      visible: true,
    })),
    { width: 360, height: 320 },
  );
  assert.ok(positions.every((p) => p.visible));
  for (let i = 0; i < positions.length; i++) {
    const a = positions[i];
    assert.ok(
      a.x - a.width / 2 >= 0 &&
        a.x + a.width / 2 <= 360 &&
        a.y - a.height >= 0 &&
        a.y <= 320,
    );
    for (let j = i + 1; j < positions.length; j++) {
      const b = positions[j];
      assert.ok(
        Math.abs(a.x - b.x) >= (a.width + b.width) / 2 ||
          a.y <= b.y - b.height ||
          b.y <= a.y - a.height,
      );
    }
  }
});
