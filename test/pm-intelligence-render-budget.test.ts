import assert from "node:assert/strict";
import test from "node:test";

import { InstancedMesh, Matrix4, MeshBasicMaterial, Vector3 } from "three";

import { createKnowledgeConnections } from "../components/pm-intelligence-world/three/knowledgeConnections";
import { planWalk } from "../lib/pm-intelligence-world/observatory-navigation";

void test("all four knowledge routes share one draw while preserving every authored dot", () => {
  const expected: Vector3[] = [];
  for (const destination of [
    "writing",
    "questions",
    "learning",
    "decisions",
  ] as const) {
    const points = planWalk([-1, 0.5, 9.4], destination)
      .slice(2)
      .map((p) => new Vector3(...p));
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const n = Math.ceil(a.distanceTo(b) / 0.45);
      for (let k = 0; k < n; k++)
        expected.push(
          a
            .clone()
            .lerp(b, k / n)
            .add(new Vector3(0.25, 0.18, 0)),
        );
    }
  }
  const mesh = createKnowledgeConnections();
  assert.ok(mesh instanceof InstancedMesh);
  assert.ok(expected.length > 100);
  assert.equal(mesh.count, expected.length);
  assert.equal(mesh.children.length, 0);
  assert.equal(mesh.visible, false);
  assert.ok(mesh.material instanceof MeshBasicMaterial);
  assert.equal(mesh.material.color.getHexString(), "67e6e2");
  assert.equal(mesh.material.opacity, 0.65);
  assert.equal(mesh.geometry.parameters.radius, 0.045);
  const matrix = new Matrix4(),
    position = new Vector3();
  for (const [i, point] of expected.entries()) {
    mesh.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    assert.ok(position.distanceTo(point) < 0.000_01);
    assert.ok(mesh.boundingSphere!.distanceToPoint(point) <= 0.05);
  }
  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.receiveShadow, false);
  let released = false;
  mesh.addEventListener("dispose", () => {
    released = true;
  });
  mesh.dispose();
  mesh.geometry.dispose();
  mesh.material.dispose();
  assert.ok(released);
});
