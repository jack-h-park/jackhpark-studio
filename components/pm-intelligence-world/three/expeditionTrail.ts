import {
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";

import { expeditionMission } from "@/lib/pm-intelligence-world/observatory-mission";
import {
  planWalk,
  type WalkPoint,
} from "@/lib/pm-intelligence-world/observatory-navigation";
import {
  type ObservatoryLocation,
  observatoryLocations,
  type ObservatoryState,
} from "@/lib/pm-intelligence-world/observatory-state";

export function createExpeditionTrail() {
  const group = new Group();
  group.name = "Suggested expedition / actual walk graph";
  const dots = new InstancedMesh(
    new SphereGeometry(0.065, 5, 4),
    new MeshBasicMaterial({
      color: "#ffd495",
      transparent: true,
      opacity: 0.7,
    }),
    160,
  );
  const traveler = new Mesh(
    new SphereGeometry(0.13, 8, 6),
    new MeshBasicMaterial({ color: "#fff2cf" }),
  );
  const beacon = new Mesh(
    new TorusGeometry(0.8, 0.04, 6, 32),
    new MeshBasicMaterial({
      color: "#ffd495",
      transparent: true,
      opacity: 0.85,
    }),
  );
  beacon.rotation.x = Math.PI / 2;
  const stations = observatoryLocations.filter((l) => l.id !== "decisions");
  const stems = new InstancedMesh(
    new CylinderGeometry(0.035, 0.065, 0.62, 6),
    new MeshBasicMaterial({ color: "#af8c5b" }),
    stations.length,
  );
  const lamps = new InstancedMesh(
    new SphereGeometry(0.13, 6, 5),
    new MeshBasicMaterial({ color: "#ffffff" }),
    stations.length,
  );
  const placement = new Object3D();
  for (const [i, station] of stations.entries()) {
    placement.position.set(
      station.position[0] + 0.65,
      station.position[1] + 0.31,
      station.position[2] + 0.22,
    );
    placement.updateMatrix();
    stems.setMatrixAt(i, placement.matrix);
    placement.position.y += 0.41;
    placement.updateMatrix();
    lamps.setMatrixAt(i, placement.matrix);
    lamps.setColorAt(i, new Color("#536677"));
  }
  group.add(dots, traveler, beacon, stems, lamps);
  group.visible = false;
  let points: Vector3[] = [];
  const matrix = new Object3D();
  return {
    group,
    traveler,
    lamps,
    updateReceipts(state: ObservatoryState) {
      const mission = expeditionMission(state);
      for (let i = 0; i < stations.length; i++)
        lamps.setColorAt(
          i,
          new Color(
            mission.receipts[i]
              ? "#ffd495"
              : i === mission.index
                ? "#d7f6ff"
                : "#536677",
          ),
        );
      if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
    },
    get points() {
      return points;
    },
    clear() {
      group.visible = false;
      points = [];
    },
    update(origin: WalkPoint, destination: ObservatoryLocation) {
      const route = [
        new Vector3(...origin),
        ...planWalk(origin, destination).map((p) => new Vector3(...p)),
      ];
      points = [];
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1],
          b = route[i];
        const count = Math.ceil(a.distanceTo(b) / 0.4);
        for (let k = 0; k < count && points.length < 160; k++)
          points.push(
            a
              .clone()
              .lerp(b, k / count)
              .add(new Vector3(0, 0.16, 0)),
          );
      }
      for (const [i, p] of points.entries()) {
        matrix.position.copy(p);
        matrix.updateMatrix();
        dots.setMatrixAt(i, matrix.matrix);
      }
      dots.count = points.length;
      dots.instanceMatrix.needsUpdate = true;
      dots.computeBoundingSphere();
      const location = observatoryLocations.find((l) => l.id === destination)!;
      beacon.position.set(
        location.position[0],
        location.position[1] + 0.12,
        location.position[2],
      );
      traveler.visible = points.length > 0;
      traveler.position.copy(points[0] ?? beacon.position);
      group.visible = true;
    },
    animate(elapsed: number, motion: boolean) {
      if (!group.visible) return;
      if (points.length) {
        const phase = motion ? (elapsed * 6) % points.length : 0;
        const index = Math.floor(phase);
        traveler.position
          .copy(points[index])
          .lerp(points[Math.min(index + 1, points.length - 1)], phase - index);
      }
      beacon.scale.setScalar(motion ? 1 + Math.sin(elapsed * 2) * 0.08 : 1);
    },
  };
}
