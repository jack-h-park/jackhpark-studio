import {
  BoxGeometry,
  type Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  TorusGeometry,
} from "three";

import {
  type StationId,
  stationIds,
} from "@/lib/pm-intelligence-world/scene-labels";

export function resolveStationId(object: Object3D): StationId | null {
  let cursor: Object3D | null = object;
  while (cursor) {
    const id: unknown = cursor.userData.section;
    if (stationIds.includes(id as StationId)) return id as StationId;
    cursor = cursor.parent;
  }
  return null;
}
export function createStation(id: StationId, color: Color): Group {
  const station = new Group();
  station.userData.section = id;
  const material = (brightness: number) =>
    new MeshStandardMaterial({
      color: color.clone().multiplyScalar(brightness),
      metalness: 0.25,
      roughness: 0.6,
    });
  const body = material(0.4),
    edge = material(0.8),
    paper = material(0.65);
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    paint = body,
  ) => {
    const object = new Mesh(new BoxGeometry(w, h, d), paint);
    object.position.set(x, y, z);
    station.add(object);
    return object;
  };
  const cylinder = (
    r: number,
    h: number,
    x: number,
    y: number,
    z: number,
    paint = body,
  ) => {
    const object = new Mesh(new CylinderGeometry(r, r, h, 32), paint);
    object.position.set(x, y, z);
    station.add(object);
    return object;
  };
  if (id === "knowledge") {
    for (let shelf = 0; shelf < 4; shelf++) {
      box(2.1, 0.09, 1.5, 0, 0.5 + shelf * 0.48, 0);
      for (let book = 0; book < 5; book++)
        box(0.16, 0.3, 0.85, -0.8 + book * 0.4, 0.7 + shelf * 0.48, 0, paper);
    }
    const ring = new Mesh(new TorusGeometry(0.65, 0.035, 10, 64), edge);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.85;
    station.add(ring);
  } else if (id === "inputs") {
    for (let i = 0; i < 3; i++) {
      box(0.42, 0.8 + i * 0.4, 0.65, (i - 1) * 0.65, 0.55 + i * 0.2, 0);
      box(0.45, 0.035, 0.68, (i - 1) * 0.65, 0.97 + i * 0.4, 0, edge);
    }
  } else if (id === "writing") {
    box(2, 0.12, 1.3, 0, 0.55, 0);
    box(1.2, 0.05, 0.85, -0.2, 0.65, 0, paper);
    for (let i = 0; i < 3; i++)
      box(0.65 - i * 0.1, 0.025, 0.035, -0.35, 0.69, -0.2 + i * 0.17, edge);
    const pen = cylinder(0.045, 1, 0.55, 1.05, -0.2, edge);
    pen.rotation.z = -0.35;
  } else if (id === "questions") {
    box(1.9, 0.12, 1.2, 0, 0.55, 0);
    for (let i = 0; i < 2; i++) {
      const ring = new Mesh(
        new TorusGeometry(0.43, 0.08, 10, 48),
        i ? paper : edge,
      );
      ring.position.set(i ? 0.42 : -0.42, i ? 1.48 : 1.08, 0);
      station.add(ring);
      box(0.22, 0.12, 0.12, i ? 0.65 : -0.65, i ? 1.05 : 0.65, 0, edge);
    }
  } else if (id === "learning") {
    box(1.65, 0.18, 1.15, 0, 0.55, 0);
    const left = box(0.78, 0.13, 1.06, -0.4, 0.75, 0, paper);
    left.rotation.z = 0.15;
    const right = box(0.78, 0.13, 1.06, 0.4, 0.75, 0, paper);
    right.rotation.z = -0.15;
    box(0.055, 0.14, 1.1, 0, 0.77, 0, edge);
    for (let i = 0; i < 3; i++) {
      box(0.5, 0.025, 0.03, -0.4, 0.87, -0.25 + i * 0.2, edge);
      box(0.5, 0.025, 0.03, 0.4, 0.87, -0.25 + i * 0.2, edge);
    }
  } else {
    cylinder(0.88, 0.12, 0, 0.8, 0);
    cylinder(0.14, 0.55, 0, 0.48, 0);
    box(0.65, 0.1, 0.45, 0, 0.9, 0, paper);
    for (const x of [-1.1, 1.1]) {
      box(0.4, 0.12, 0.45, x, 0.45, 0);
      box(0.1, 0.55, 0.45, x, 0.75, -0.2);
    }
    // The open gate represents a requested decision awaiting judgment.
    for (const x of [-0.5, 0.5]) box(0.07, 0.9, 0.07, x, 1.35, -0.7, edge);
  }
  return station;
}
