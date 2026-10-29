import {
  type BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Static edge planting uses one draw call per material and leaves the walking lanes clear. */
export function createObservatoryGarden() {
  const group = new Group();
  group.name = "Alpine terrace gardens";
  const batches: BufferGeometry[][] = Array.from({ length: 5 }, () => []);
  const materials = [
    new MeshStandardMaterial({ color: "#9f806a", roughness: 0.8 }),
    new MeshStandardMaterial({ color: "#527b72", roughness: 0.9 }),
    new MeshStandardMaterial({ color: "#ac98c5", roughness: 0.8 }),
    new MeshStandardMaterial({ color: "#d5bb7b", roughness: 0.65 }),
    new MeshStandardMaterial({
      color: "#f6c581",
      emissive: "#ffb866",
      emissiveIntensity: 1.5,
      roughness: 0.5,
    }),
  ];
  const add = (
    index: number,
    g: BufferGeometry,
    x: number,
    y: number,
    z: number,
  ) => {
    g.translate(x, y, z);
    batches[index].push(g);
  };
  const beds = [
    [-4.1, 0.5, 8.8],
    [0.6, 0.5, 10.6],
    [6.9, 0.8, 8.5],
    [0, 3.8, -7.6],
    [-10, 5, -4.8],
    [8, 5, -5.25],
    [11.2, 3.3, 0.35],
    [12.6, 1.95, 4.1],
  ];
  for (const [n, [x, y, z]] of beds.entries()) {
    add(0, new CylinderGeometry(0.37, 0.29, 0.33, 10), x, y + 0.17, z);
    add(0, new CylinderGeometry(0.41, 0.41, 0.06, 10), x, y + 0.34, z);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.399 + n,
        r = 0.09 + (0.18 * (i % 3)) / 2;
      const xx = x + Math.cos(a) * r,
        zz = z + Math.sin(a) * r,
        h = 0.34 + (i % 3) * 0.11;
      add(
        1,
        new CylinderGeometry(0.009, 0.013, h, 4),
        xx,
        y + 0.34 + h / 2,
        zz,
      );
      const leaf = new SphereGeometry(0.12, 5, 4);
      leaf.scale(1, 0.23, 0.5);
      leaf.rotateZ(a);
      add(1, leaf, xx + 0.04, y + 0.45, zz);
      const flower = new SphereGeometry(0.055, 5, 4);
      flower.scale(1, 1.5, 1);
      add(n % 2 ? 3 : 2, flower, xx, y + 0.34 + h, zz);
    }
  }
  // Small warm reflectors punctuate the path edges without adding real-time lights.
  for (const [x, y, z] of [
    [-2.15, 1.2, 5.4],
    [-2.15, 2.3, 3.4],
    [-2.15, 3.45, 1.4],
    [2.2, 0.5, 7.55],
    [3.8, 0.65, 7.55],
    [-5.7, 4.5, -6.9],
    [4.5, 4.5, -7.6],
    [9.5, 2.48, 1.5],
  ]) {
    add(3, new CylinderGeometry(0.055, 0.07, 0.44, 6), x, y + 0.22, z);
    add(4, new SphereGeometry(0.075, 6, 4), x, y + 0.46, z);
  }
  for (const [i, parts] of batches.entries()) {
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    const mesh = new Mesh(geometry, materials[i]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData.planterCenters = beds.map(([x, y, z]) => new Vector3(x, y, z));
  return group;
}
