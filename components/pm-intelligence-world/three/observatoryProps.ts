import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PointLight,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { InputId } from "@/content/pm-intelligence-world/types";

function bar(a: Vector3, b: Vector3, radius = 0.013) {
  const delta = b.clone().sub(a);
  const geometry = new CylinderGeometry(radius, radius, delta.length(), 6);
  geometry.applyQuaternion(
    new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      delta.normalize(),
    ),
  );
  geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
  return geometry;
}

function hexPoint(angle: number, y: number) {
  return new Vector3(Math.cos(angle) * 0.34, y, Math.sin(angle) * 0.34);
}

export function createSourceCapsule(id: InputId, color: string) {
  const group = new Group();
  const frameMaterial = new MeshStandardMaterial({
    color: "#cba976",
    roughness: 0.38,
    metalness: 0.72,
    emissive: color,
    emissiveIntensity: 0.04,
  });
  const pieces: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3,
      next = ((i + 1) * Math.PI) / 3;
    pieces.push(
      bar(hexPoint(angle, -0.34), hexPoint(angle, 0.34)),
      bar(hexPoint(angle, -0.34), hexPoint(next, -0.34)),
      bar(hexPoint(angle, 0.34), hexPoint(next, 0.34)),
      bar(hexPoint(angle, 0.34), new Vector3(0, 0.51, 0)),
    );
  }
  const frameGeometry = mergeGeometries(pieces)!;
  for (const geometry of pieces) geometry.dispose();
  const frame = new Mesh(frameGeometry, frameMaterial);
  const shell = new Mesh(
    new CylinderGeometry(0.33, 0.33, 0.67, 6),
    new MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      roughness: 0.18,
      metalness: 0.12,
    }),
  );
  const core = new Mesh(
    new OctahedronGeometry(0.15),
    new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 2.1,
      roughness: 0.25,
    }),
  );
  const crown = new Mesh(new SphereGeometry(0.055, 8, 6), frameMaterial);
  crown.position.y = 0.53;
  group.add(frame, shell, core, crown);
  const pickables = [frame, shell, core];
  for (const mesh of pickables) {
    mesh.userData.input = id;
    mesh.castShadow = true;
  }
  return { group, pickables, frameMaterial, core };
}

export function createVisitor() {
  const actor = new Group();
  const cloth = new MeshStandardMaterial({ color: "#759ca3", roughness: 0.9 });
  const dark = new MeshStandardMaterial({ color: "#303044", roughness: 0.9 });
  const leather = new MeshStandardMaterial({
    color: "#77523e",
    roughness: 0.85,
  });
  const ivory = new MeshStandardMaterial({ color: "#e6d7b6", roughness: 0.8 });
  const skin = new MeshStandardMaterial({ color: "#c99269", roughness: 0.9 });
  const brass = new MeshStandardMaterial({
    color: "#bc9862",
    roughness: 0.4,
    metalness: 0.6,
  });
  const part = (
    parent: Group,
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  part(actor, new CylinderGeometry(0.19, 0.23, 0.42, 10), cloth, 0, 0.76, 0);
  part(actor, new CylinderGeometry(0.145, 0.145, 0.07, 10), ivory, 0, 0.97, 0);
  part(actor, new SphereGeometry(0.18, 12, 8), skin, 0, 1.1, 0.015);
  part(actor, new SphereGeometry(0.052, 8, 6), skin, 0, 1.08, 0.18);
  for (const x of [-0.067, 0.067])
    part(actor, new SphereGeometry(0.019, 8, 6), dark, x, 1.13, 0.166);
  part(actor, new CylinderGeometry(0.29, 0.29, 0.045, 16), ivory, 0, 1.23, 0);
  part(
    actor,
    new SphereGeometry(0.225, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    ivory,
    0,
    1.24,
    0,
  );
  part(
    actor,
    new CylinderGeometry(0.226, 0.226, 0.04, 16),
    leather,
    0,
    1.25,
    0,
  );
  part(actor, new BoxGeometry(0.3, 0.36, 0.16), leather, 0, 0.78, -0.24);
  part(actor, new BoxGeometry(0.22, 0.13, 0.035), leather, 0, 0.72, -0.335);
  part(actor, new BoxGeometry(0.055, 0.055, 0.02), brass, 0, 0.75, -0.36);
  for (const x of [-0.14, 0.14])
    part(actor, new BoxGeometry(0.035, 0.32, 0.03), leather, x, 0.78, 0.19);
  part(actor, new BoxGeometry(0.018, 0.34, 0.025), brass, 0, 0.76, 0.22);
  part(
    actor,
    new CylinderGeometry(0.235, 0.235, 0.06, 10),
    leather,
    0,
    0.56,
    0,
  );
  const legs: Group[] = [],
    arms: Group[] = [];
  for (const x of [-0.115, 0.115]) {
    const leg = new Group();
    leg.position.set(x, 0.49, 0);
    actor.add(leg);
    legs.push(leg);
    part(leg, new CylinderGeometry(0.075, 0.085, 0.36, 8), dark, 0, -0.19, 0);
    part(leg, new BoxGeometry(0.15, 0.12, 0.24), leather, 0, -0.4, 0.045);
    part(leg, new BoxGeometry(0.155, 0.035, 0.245), dark, 0, -0.47, 0.045);
    const arm = new Group();
    arm.position.set(x < 0 ? -0.28 : 0.28, 0.94, 0);
    actor.add(arm);
    arms.push(arm);
    part(arm, new CylinderGeometry(0.067, 0.075, 0.29, 8), cloth, 0, -0.16, 0);
    part(arm, new SphereGeometry(0.07, 8, 6), skin, 0, -0.34, 0);
  }
  const lantern = new Group();
  lantern.position.set(0, -0.49, 0.025);
  arms[1].add(lantern);
  const light = new MeshStandardMaterial({
    color: "#ffcb76",
    emissive: "#ffad47",
    emissiveIntensity: 3,
  });
  part(lantern, new CylinderGeometry(0.065, 0.065, 0.15, 6), light, 0, 0, 0);
  part(
    lantern,
    new CylinderGeometry(0.105, 0.105, 0.025, 6),
    brass,
    0,
    -0.09,
    0,
  );
  part(lantern, new CylinderGeometry(0.11, 0.025, 0.09, 6), brass, 0, 0.12, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    part(
      lantern,
      new CylinderGeometry(0.01, 0.01, 0.19, 4),
      brass,
      Math.cos(a) * 0.075,
      0,
      Math.sin(a) * 0.075,
    );
  }
  lantern.add(new PointLight(new Color("#ffbc6a"), 0.7, 2.5, 2));
  return { actor, legs, arms };
}
