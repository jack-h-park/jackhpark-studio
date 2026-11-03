import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  TorusGeometry,
  Vector3,
} from "three";

import type { SpatialFeedback } from "@/lib/pm-intelligence-world/spatial-feedback";
import {
  planWalk,
  walkNodes,
  type WalkPoint,
} from "@/lib/pm-intelligence-world/observatory-navigation";
import {
  type ObservatoryLocation,
  observatoryLocations,
} from "@/lib/pm-intelligence-world/observatory-state";

/** At most two pulses and one illustrative practice receipt; never auto-operates a tool. */
export function createSpatialFeedback() {
  const group = new Group();
  group.name = "Visitor activity feedback / not live Agent traffic";
  const makeRing = (radius: number, color: string) => {
    const ring = new Mesh(
      new TorusGeometry(radius, 0.025, 4, 40),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    return ring;
  };
  const arrival = makeRing(0.68, "#9ddff0"),
    outcome = makeRing(0.86, "#85deed");
  const courier = new Group();
  courier.name = "Completed teaching record returns to shared knowledge";
  const paper = new Mesh(
    new BoxGeometry(0.23, 0.3, 0.045),
    new MeshBasicMaterial({ color: "#fff1ce", toneMapped: false }),
  );
  const seal = new Mesh(
    new BoxGeometry(0.12, 0.035, 0.055),
    new MeshBasicMaterial({ color: "#ffc577", toneMapped: false }),
  );
  seal.position.set(0, -0.05, 0.01);
  courier.add(paper, seal);
  group.add(courier);
  const tailGeometry = new BufferGeometry();
  const tailPositions = new Float32Array(8 * 3);
  tailGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(tailPositions, 3),
  );
  const tail = new Points(
    tailGeometry,
    new PointsMaterial({
      color: "#ffd495",
      size: 3,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      sizeAttenuation: false,
      toneMapped: false,
    }),
  );
  tail.frustumCulled = false;
  group.add(tail);
  let arrivalAge = Infinity,
    outcomeAge = Infinity,
    flightAge = Infinity;
  let path: Vector3[] = [],
    lengths: number[] = [],
    total = 0;
  const at = (distance: number, target: Vector3) => {
    const d = Math.max(0, Math.min(total, distance));
    let index = 1;
    while (index < lengths.length - 1 && lengths[index] < d) index++;
    if (!path.length) return target.set(0, 0, 0);
    if (path.length === 1) return target.copy(path[0]);
    const start = lengths[index - 1],
      span = lengths[index] - start;
    return target
      .copy(path[index - 1])
      .lerp(path[index], span ? (d - start) / span : 0);
  };
  const temporary = new Vector3();
  const reset = () => {
    arrivalAge = outcomeAge = flightAge = Infinity;
    arrival.visible =
      outcome.visible =
      courier.visible =
      tail.visible =
      group.visible =
        false;
    path = [];
    lengths = [];
    total = 0;
  };
  reset();
  const pulse = (ring: typeof arrival, point: WalkPoint) => {
    ring.position.set(point[0], point[1] + 0.2, point[2]);
    ring.scale.setScalar(1);
    ring.material.opacity = 0.85;
    ring.visible = true;
    group.visible = true;
  };
  return {
    group,
    courier,
    get path() {
      return path;
    },
    reset,
    arrive(location: ObservatoryLocation) {
      const point = observatoryLocations.find(
        (l) => l.id === location,
      )!.position;
      arrivalAge = 0;
      pulse(arrival, point);
    },
    emit(event: SpatialFeedback, point?: WalkPoint) {
      const location = observatoryLocations.find(
        (l) => l.id === event.location,
      )!;
      outcomeAge = 0;
      outcome.material.color.set(
        event.kind === "revise"
          ? "#e99485"
          : event.kind === "completed"
            ? "#ffc577"
            : "#85deed",
      );
      pulse(outcome, point ?? location.position);
      if (event.kind !== "completed") return;
      path = planWalk(walkNodes[event.location], "knowledge").map(
        (p) => new Vector3(p[0], p[1] + 0.95, p[2]),
      );
      lengths = [0];
      total = 0;
      for (let i = 1; i < path.length; i++) {
        total += path[i].distanceTo(path[i - 1]);
        lengths.push(total);
      }
      flightAge = 0;
      courier.visible = tail.visible = true;
      seal.material.color.set(
        event.source === "external-signals"
          ? "#65dcf4"
          : event.source === "hands-on-projects"
            ? "#ffc577"
            : "#c19aff",
      );
      at(0, courier.position);
      for (let i = 0; i < 8; i++)
        courier.position.toArray(tailPositions, i * 3);
      tail.geometry.attributes.position.needsUpdate = true;
    },
    animate(delta: number, motion: boolean) {
      if (!motion) {
        reset();
        return;
      }
      if (!group.visible) return;
      const dt = Math.max(0, delta);
      arrivalAge += dt;
      outcomeAge += dt;
      flightAge += dt;
      for (const [ring, age, duration] of [
        [arrival, arrivalAge, 1.5],
        [outcome, outcomeAge, 1.2],
      ] as const) {
        ring.visible = age < duration;
        if (ring.visible) {
          ring.scale.setScalar(1 + age * 0.65);
          ring.material.opacity = 0.85 * (1 - age / duration);
        }
      }
      courier.visible = tail.visible = flightAge < 3.2 && path.length > 1;
      if (courier.visible) {
        const distance = total * Math.min(1, flightAge / 3.2);
        at(distance, courier.position);
        courier.rotation.y = flightAge * 1.8;
        courier.rotation.z = Math.sin(flightAge * 4) * 0.08;
        for (let i = 0; i < 8; i++)
          at(distance - i * 0.22, temporary).toArray(tailPositions, i * 3);
        tail.geometry.attributes.position.needsUpdate = true;
      }
      group.visible = arrival.visible || outcome.visible || courier.visible;
    },
  };
}
