import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  SphereGeometry,
  TorusGeometry,
} from "three";

import type { PlayDestination } from "@/content/pm-intelligence-world/activities";
import type { ObservatoryState } from "@/lib/pm-intelligence-world/observatory-state";
import { getExhibitState } from "@/lib/pm-intelligence-world/observatory-exhibits";

export function createDestinationExhibits() {
  const group = new Group();
  group.name = "Knowledge reuse installations";
  const stone = new MeshStandardMaterial({ color: "#48445f", roughness: 0.88 });
  const brass = new MeshStandardMaterial({
    color: "#c7a16b",
    metalness: 0.65,
    roughness: 0.35,
  });
  const paper = new MeshStandardMaterial({ color: "#f6e6bb", roughness: 0.85 });
  const green = new MeshStandardMaterial({ color: "#739c80", roughness: 0.8 });
  const wood = new MeshStandardMaterial({ color: "#694b47", roughness: 0.85 });
  const positions: Record<PlayDestination, readonly [number, number, number]> =
    {
      writing: [-9, 5, -4.7],
      questions: [7, 5, -5.2],
      learning: [10.2, 3.3, 0],
      decisions: [11.4, 1.95, 5.2],
    };
  const colors: Record<PlayDestination, string> = {
    writing: "#ffc577",
    questions: "#85deed",
    learning: "#b2dab0",
    decisions: "#c6a5ee",
  };
  const views = (Object.keys(positions) as PlayDestination[]).map(
    (destination) => {
      const root = new Group();
      root.name = `Exhibit / ${destination}`;
      root.position.set(...positions[destination]);
      group.add(root);
      const glow = new MeshStandardMaterial({
        color: colors[destination],
        emissive: colors[destination],
        emissiveIntensity: 0.12,
        roughness: 0.4,
        metalness: 0.3,
      });
      const part = (
        parent: Group,
        geometry: BufferGeometry,
        material: MeshStandardMaterial,
        x = 0,
        y = 0,
        z = 0,
      ) => {
        const mesh = new Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.location = destination;
        parent.add(mesh);
        return mesh;
      };
      part(root, new CylinderGeometry(0.8, 0.88, 0.16, 12), stone, 0, 0.08);
      const rim = part(
        root,
        new TorusGeometry(0.76, 0.025, 6, 32),
        glow,
        0,
        0.18,
      );
      rim.rotation.x = Math.PI / 2;
      part(root, new CylinderGeometry(0.12, 0.23, 0.74, 8), brass, 0, 0.5);
      const rotor = new Group();
      root.add(rotor);
      const slots: Group[] = [];
      const slot = () => {
        const s = new Group();
        root.add(s);
        slots.push(s);
        return s;
      };
      if (destination === "writing") {
        part(root, new BoxGeometry(1.08, 0.11, 0.76), wood, 0, 0.9);
        for (const x of [-0.46, 0.46])
          part(
            root,
            new CylinderGeometry(0.035, 0.035, 1.2, 8),
            brass,
            x,
            1.44,
          );
        part(root, new BoxGeometry(1.1, 0.09, 0.14), brass, 0, 2.02);
        part(root, new CylinderGeometry(0.035, 0.035, 0.58, 8), brass, 0, 1.74);
        part(root, new BoxGeometry(0.87, 0.09, 0.62), brass, 0, 1.43);
        for (let i = 0; i < 3; i++) {
          const s = slot();
          s.position.set(0, 1 + i * 0.105, 0);
          const page = part(s, new BoxGeometry(0.78, 0.035, 0.56), paper);
          page.rotation.y = (i - 1) * 0.08;
          for (let j = 0; j <= i; j++)
            part(
              s,
              new BoxGeometry(0.44 - j * 0.06, 0.009, 0.018),
              glow,
              0,
              0.022,
              -0.15 + j * 0.09,
            );
        }
      } else if (destination === "questions") {
        part(root, new CylinderGeometry(0.57, 0.65, 0.1, 16), wood, 0, 0.93);
        const hoop = part(
          rotor,
          new TorusGeometry(0.64, 0.025, 6, 40),
          brass,
          0,
          1.65,
        );
        hoop.rotation.x = 0.3;
        for (let i = 0; i < 2; i++) {
          const s = slot();
          s.position.set(i ? 0.35 : -0.35, 1.6, i ? -0.16 : 0.16);
          part(s, new SphereGeometry(0.18, 12, 8), glow);
          const halo = part(s, new TorusGeometry(0.27, 0.018, 5, 24), brass);
          halo.rotation.x = Math.PI / 2;
        }
        const link = part(
          slots[1],
          new CylinderGeometry(0.025, 0.025, 0.76, 8),
          glow,
          -0.35,
          0,
          0.16,
        );
        link.rotation.z = Math.PI / 2;
      } else if (destination === "learning") {
        part(root, new CylinderGeometry(0.46, 0.3, 0.55, 12), wood, 0, 1.02);
        part(root, new CylinderGeometry(0.43, 0.43, 0.03, 12), stone, 0, 1.3);
        for (let i = 0; i < 3; i++) {
          const s = slot();
          s.position.y = 1.3 + i * 0.32;
          part(s, new CylinderGeometry(0.025, 0.035, 0.36, 6), green, 0, 0.15);
          for (const sign of [-1, 1]) {
            const leaf = part(
              s,
              new SphereGeometry(0.2, 8, 6),
              i === 2 ? glow : green,
              sign * 0.16,
              0.26,
              0,
            );
            leaf.scale.set(1, 0.32, 0.55);
            leaf.rotation.z = sign * 0.4;
          }
        }
      } else {
        part(root, new BoxGeometry(1.1, 0.12, 0.8), wood, 0, 0.95);
        const hoop = part(
          rotor,
          new TorusGeometry(0.55, 0.024, 6, 32),
          brass,
          0,
          1.7,
        );
        hoop.rotation.y = 0.3;
        for (let i = 0; i < 3; i++) {
          const s = slot();
          s.position.set((i - 1) * 0.31, 1.08, 0.17);
          const page = part(s, new BoxGeometry(0.25, 0.045, 0.45), paper);
          page.rotation.x = -0.2;
          part(s, new BoxGeometry(0.14, 0.015, 0.025), glow, 0, 0.07, 0);
        }
      }
      const seal = part(
        root,
        new SphereGeometry(0.105, 10, 8),
        glow,
        0,
        2.17,
        0,
      );
      seal.visible = false;
      return { destination, root, slots, rotor, glow, seal };
    },
  );
  return {
    group,
    views,
    update(state: ObservatoryState) {
      for (const view of views) {
        const value = getExhibitState(view.destination, state);
        for (const [i, s] of view.slots.entries()) {
          s.visible = value.slots[i];
        }
        view.seal.visible = value.completed;
        view.glow.emissiveIntensity = value.completed
          ? 1.3
          : value.available
            ? 0.55
            : 0.08;
      }
    },
    animate(elapsed: number, motion: boolean) {
      for (const view of views)
        view.rotor.rotation.y = motion ? Math.sin(elapsed * 0.3) * 0.14 : 0;
    },
  };
}

/** Raycasting individual targets bypasses ancestor visibility; invisible landmark materials remain intentional. */
export function isWorldTargetVisible(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}
