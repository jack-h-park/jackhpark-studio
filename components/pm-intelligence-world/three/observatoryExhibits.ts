import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Group,
  type Intersection,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  type Quaternion,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
  const controlMaterial = new MeshBasicMaterial({ visible: false });
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
  let clock = 0;
  const previews = new Map<PlayDestination, number>();
  const impulses = new Map<PlayDestination, number>();
  let hovered: PlayDestination | null = null;
  let focused: PlayDestination | null = null;
  const markerMaterial = new MeshBasicMaterial({
    color: "#85deed",
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const handlePositions: Record<
    PlayDestination,
    readonly [number, number, number]
  > = {
    writing: [0.7, 1.73, 0],
    questions: [0, 1.65, 0],
    learning: [0.83, 1.58, 0.16],
    decisions: [0, 1.7, 0],
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
        mesh.userData.operation = destination;
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
      const studs: BufferGeometry[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const g = new SphereGeometry(0.026, 6, 4);
        g.translate(Math.cos(a) * 0.68, 0.19, Math.sin(a) * 0.68);
        studs.push(g);
      }
      part(root, mergeGeometries(studs)!, brass);
      for (const g of studs) g.dispose();
      const rotor = new Group();
      root.add(rotor);
      const dialMarks = (radius: number, y: number) => {
        const ticks: BufferGeometry[] = [];
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          const g = new BoxGeometry(0.025, i % 3 ? 0.065 : 0.11, 0.025);
          g.rotateZ(a - Math.PI / 2);
          g.translate(Math.cos(a) * radius, y + Math.sin(a) * radius, 0);
          ticks.push(g);
        }
        part(rotor, mergeGeometries(ticks)!, brass);
        for (const g of ticks) g.dispose();
      };
      const slots: Group[] = [];
      const slot = () => {
        const s = new Group();
        root.add(s);
        slots.push(s);
        return s;
      };
      const water = new Group();
      water.visible = false;
      root.add(water);
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
        part(rotor, new BoxGeometry(0.87, 0.09, 0.62), brass, 0, 1.43);
        const handle = part(
          root,
          new TorusGeometry(0.23, 0.028, 6, 24),
          brass,
          0.7,
          1.73,
          0,
        );
        handle.rotation.y = Math.PI / 2;
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
        dialMarks(0.64, 1.65);
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
        rotor.position.set(0.62, 1.55, 0.16);
        part(rotor, new CylinderGeometry(0.17, 0.2, 0.33, 12), brass);
        const handle = part(
          rotor,
          new TorusGeometry(0.2, 0.027, 6, 20),
          brass,
          0.21,
          0.03,
          0,
        );
        handle.rotation.x = Math.PI / 2;
        const spout = part(
          rotor,
          new CylinderGeometry(0.04, 0.075, 0.45, 8),
          brass,
          -0.29,
          0.1,
          0,
        );
        spout.rotation.z = -1;
        for (let i = 0; i < 4; i++)
          part(
            water,
            new SphereGeometry(0.035, 6, 4),
            glow,
            0.2 - i * 0.045,
            1.55 - i * 0.14,
            0.16,
          );

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
        dialMarks(0.55, 1.7);
        for (let i = 0; i < 3; i++) {
          const s = slot();
          s.position.set((i - 1) * 0.31, 1.08, 0.17);
          const page = part(s, new BoxGeometry(0.25, 0.045, 0.45), paper);
          page.rotation.x = -0.2;
          part(s, new BoxGeometry(0.14, 0.015, 0.025), glow, 0, 0.07, 0);
        }
      }
      const control = new Mesh(
        new CylinderGeometry(0.9, 0.9, 2.3, 12),
        controlMaterial,
      );
      control.position.y = 1.15;
      control.userData.location = destination;
      control.userData.operation = destination;
      root.add(control);
      // A static overlay identifies the physical control even against foreground foliage.
      const marker = new Group();
      marker.name = `Ready control / ${destination}`;
      marker.position.set(...handlePositions[destination]);
      marker.visible = false;
      for (const geometry of [
        new TorusGeometry(0.32, 0.018, 4, 32),
        new SphereGeometry(0.035, 8, 6),
      ]) {
        const cue = new Mesh(geometry, markerMaterial);
        cue.userData.operation = destination;
        cue.userData.location = destination;
        cue.renderOrder = 20;
        marker.add(cue);
      }
      root.add(marker);
      const seal = part(
        root,
        new SphereGeometry(0.105, 10, 8),
        glow,
        0,
        2.17,
        0,
      );
      seal.visible = false;
      return {
        destination,
        control,
        marker,
        ready: false,
        root,
        slots,
        rotor,
        glow,
        seal,
        water,
        available: false,
        completed: false,
      };
    },
  );
  return {
    group,
    views,
    focus(destination: PlayDestination | null) {
      focused = destination;
      for (const view of views)
        view.marker.visible = view.ready && view.destination === focused;
    },
    preview(destination: PlayDestination, amount: number | null) {
      if (amount === null) previews.delete(destination);
      else previews.set(destination, Math.max(-2, Math.min(2, amount)));
    },
    trigger(destination: PlayDestination) {
      impulses.set(destination, clock);
    },
    resetMotion() {
      impulses.clear();
      previews.clear();
    },
    hover(destination: PlayDestination | null) {
      hovered = destination;
    },
    update(state: ObservatoryState) {
      for (const view of views) {
        const value = getExhibitState(view.destination, state);
        for (const [i, s] of view.slots.entries()) {
          s.visible = value.slots[i];
        }
        view.available = value.available;
        view.ready = value.ready;
        view.marker.visible = view.ready && view.destination === focused;
        view.completed = value.completed;
        view.seal.visible = value.completed;
        view.glow.emissiveIntensity = value.completed
          ? 1.3
          : value.available
            ? 0.55
            : 0.08;
      }
    },
    animate(elapsed: number, motion: boolean, orientation?: Quaternion) {
      clock = elapsed;
      for (const view of views) {
        if (view.marker.visible && orientation)
          view.marker.quaternion.copy(orientation);
        const start = impulses.get(view.destination);
        const t =
          start === undefined
            ? 1
            : Math.max(0, Math.min(1, (elapsed - start) / 0.9));
        const preview = motion ? (previews.get(view.destination) ?? 0) : 0;
        const pulse = Math.max(
          Math.abs(preview) * 0.7,
          motion && t < 1 ? Math.sin(t * Math.PI) : 0,
        );
        view.rotor.position.y =
          view.destination === "learning"
            ? 1.55
            : view.destination === "writing"
              ? pulse
                ? -pulse * 0.12
                : 0
              : 0;
        view.rotor.rotation.z =
          view.destination === "learning" && pulse ? pulse * 0.6 : 0;
        view.rotor.rotation.y =
          view.destination === "questions" || view.destination === "decisions"
            ? motion
              ? Math.sin(elapsed * 0.3) * 0.14 + (preview || pulse * 1.3)
              : 0
            : 0;
        view.water.visible =
          motion && view.destination === "learning" && pulse > 0.15;
        view.glow.emissiveIntensity =
          (view.completed ? 0.9 : view.available ? 0.4 : 0.08) +
          (hovered === view.destination ? 0.35 : 0) +
          pulse * 0.5;
        if (t >= 1 || !motion) impulses.delete(view.destination);
      }
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

/** Prefer visible source/instrument geometry over deliberately broad landmark volumes. */
export function pickWorldTarget(
  hits: ReadonlyArray<Intersection<Object3D>>,
): Intersection<Object3D> | undefined {
  const visible = hits.filter((hit) => isWorldTargetVisible(hit.object));
  return (
    visible.find(
      (hit) => hit.object.userData.input || hit.object.userData.operation,
    ) ?? visible[0]
  );
}
