import {
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from "three";

import { planWalk } from "@/lib/pm-intelligence-world/observatory-navigation";

/** Keep the authored dots and their overlaps; only their submission is batched. */
export function createKnowledgeConnections() {
  const positions: Vector3[] = [];
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
      const count = Math.ceil(a.distanceTo(b) / 0.45);
      for (let k = 0; k < count; k++)
        positions.push(
          a
            .clone()
            .lerp(b, k / count)
            .add(new Vector3(0.25, 0.18, 0)),
        );
    }
  }
  const mesh = new InstancedMesh(
    new SphereGeometry(0.045, 5, 4),
    new MeshBasicMaterial({
      color: "#67e6e2",
      transparent: true,
      opacity: 0.65,
    }),
    positions.length,
  );
  mesh.name = "Knowledge reuse connections / one instanced draw";
  const placement = new Object3D();
  for (const [i, position] of positions.entries()) {
    placement.position.copy(position);
    placement.updateMatrix();
    mesh.setMatrixAt(i, placement.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.visible = false;
  return mesh;
}
