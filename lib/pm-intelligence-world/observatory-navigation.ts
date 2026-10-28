import {
  type ObservatoryLocation,
  observatoryLocations,
} from "./observatory-state";

export type WalkPoint = readonly [number, number, number];
// Coordinates follow the authored paving, with the upper ring outside the archive drum.
export const walkNodes: Record<string, WalkPoint> = {
  start: [-1, 0.5, 9.4],
  signals: [-0.2, 0.5, 8.8],
  hub: [-1, 0.5, 7],
  terraceLane: [-1.2, 0.5, 8.5],
  reviewLane: [-1, 0.5, 6.7],
  reviewBridge: [1.2, 0.5, 6.7],
  review: [5.5, 0.8, 7.4],
  reviewApproach: [5.3, 0.8, 6.8],
  knowledge: [-1, 3.8, 1],
  leftFront: [-3.5, 3.8, -0.8],
  leftRing: [-4.2, 3.8, -3.5],
  leftBack: [-3, 3.8, -5.8],
  writing: [-7.25, 5, -6.5],
  rightFront: [3.5, 3.8, -0.8],
  rightRing: [4.2, 3.8, -3.5],
  rightBack: [3, 3.8, -5.8],
  questions: [5.25, 5, -7],
  greenhouseBridge: [3.8, 3.8, -2],
  learning: [8, 3.3, -1.5],
  greenhouseSide: [8, 3.3, 1],
  decisions: [10, 1.65, 3],
};
const edges: Array<[string, string, number]> = [
  ["start", "signals", 0.7],
  ["signals", "terraceLane", 0.6],
  ["terraceLane", "hub", 0.6],
  ["hub", "reviewLane", 0.6],
  ["reviewLane", "reviewBridge", 0.6],
  ["reviewBridge", "reviewApproach", 0.5],
  ["reviewApproach", "review", 0.4],
  ["hub", "knowledge", 0.65],
  ["knowledge", "leftFront", 0.45],
  ["leftFront", "leftRing", 0.4],
  ["leftRing", "leftBack", 0.4],
  ["leftBack", "writing", 0.4],
  ["knowledge", "rightFront", 0.4],
  ["rightFront", "greenhouseBridge", 0.4],
  ["greenhouseBridge", "rightRing", 0.4],
  ["rightRing", "rightBack", 0.4],
  ["rightBack", "questions", 0.4],
  ["greenhouseBridge", "learning", 0.45],
  ["learning", "greenhouseSide", 0.4],
  ["greenhouseSide", "decisions", 0.35],
];
const areas: Array<[WalkPoint, number]> = [
  [[-1, 0.5, 8.7], 1.85],
  [walkNodes.review, 0.7],
  ...(
    ["knowledge", "writing", "questions", "learning", "decisions"] as const
  ).map(
    (id) =>
      [walkNodes[id], id === "writing" || id === "questions" ? 0.4 : 0.6] as [
        WalkPoint,
        number,
      ],
  ),
];
const blockers: Array<[number, number, number]> = [
  [-2.2, 7.6, 0.78],
  [-0.2, 7.7, 0.78],
  [1.8, 7.6, 0.78],
  [-3, 9.5, 0.65],
  [-3.1, 8.6, 0.5],
  [5, 7.5, 0.42],
  [6.6, 6.5, 1.15],
];
const horizontalDistance = (a: WalkPoint, b: WalkPoint) =>
  Math.hypot(a[0] - b[0], a[2] - b[2]);
function project(p: WalkPoint, a: WalkPoint, b: WalkPoint): WalkPoint {
  const dx = b[0] - a[0],
    dz = b[2] - a[2];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / (dx * dx + dz * dz),
    ),
  );
  return [a[0] + dx * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t];
}
function floorAt(p: WalkPoint): number | null {
  if (p[0] >= -10.6 && p[0] <= -7.4 && p[2] >= -7.8 && p[2] <= -5.2)
    return null;
  if (p[0] >= 5.4 && p[0] <= 8.6 && p[2] >= -8.3 && p[2] <= -5.7) return null;
  if (blockers.some(([x, z, r]) => Math.hypot(p[0] - x, p[2] - z) < r))
    return null;
  const candidates: Array<[number, number]> = [];
  for (const [a, b, radius] of edges) {
    const foot = project(p, walkNodes[a], walkNodes[b]);
    if (
      horizontalDistance(p, foot) <= radius &&
      Math.abs(p[1] - foot[1]) < 0.65
    )
      candidates.push([horizontalDistance(p, foot), foot[1]]);
  }
  for (const [center, radius] of areas)
    if (
      horizontalDistance(p, center) <= radius &&
      Math.abs(p[1] - center[1]) < 0.65
    )
      candidates.push([horizontalDistance(p, center), center[1]]);
  return candidates.toSorted((a, b) => a[0] - b[0])[0]?.[1] ?? null;
}
/** Input is screen-right / screen-up, transformed by the planar camera direction. */
export function stepWalker(
  p: WalkPoint,
  input: readonly [number, number],
  seconds: number,
  forward: readonly [number, number],
): WalkPoint {
  const length = Math.hypot(...input);
  if (!length) return p;
  const f = Math.hypot(...forward) || 1,
    speed = 3.2 * Math.min(0.05, Math.max(0, seconds));
  const dx =
    ((-forward[1] * input[0] + forward[0] * input[1]) / f / length) * speed;
  const dz =
    ((forward[0] * input[0] + forward[1] * input[1]) / f / length) * speed;
  for (const [x, z] of [
    [p[0] + dx, p[2] + dz],
    [p[0] + dx, p[2]],
    [p[0], p[2] + dz],
  ]) {
    const height = floorAt([x, p[1], z]);
    if (height !== null) return [x, height, z];
  }
  return p;
}
export function nearestDestination(p: WalkPoint): ObservatoryLocation | null {
  const nearest = observatoryLocations
    .map((l) => ({
      id: l.id,
      distance:
        horizontalDistance(p, l.position) + Math.abs(p[1] - l.position[1]) * 2,
    }))
    .toSorted((a, b) => a.distance - b.distance)[0];
  return nearest.distance <= 1.3 ? nearest.id : null;
}
/** Attach to the closest walkway segment, then use its cheapest graph route. */
export function planWalk(
  p: WalkPoint,
  destination: ObservatoryLocation,
): WalkPoint[] {
  const distances: Record<string, number> = { [destination]: 0 };
  const next: Record<string, string> = {};
  const pending = new Set(Object.keys(walkNodes));
  while (pending.size) {
    const node = [...pending].toSorted(
      (a, b) => (distances[a] ?? Infinity) - (distances[b] ?? Infinity),
    )[0];
    pending.delete(node);
    for (const [a, b] of edges) {
      const other = a === node ? b : b === node ? a : null;
      if (!other || !pending.has(other)) continue;
      const cost =
        distances[node] + horizontalDistance(walkNodes[node], walkNodes[other]);
      if (cost < (distances[other] ?? Infinity)) {
        distances[other] = cost;
        next[other] = node;
      }
    }
  }
  const attached = edges
    .map(([a, b]) => {
      const point = project(p, walkNodes[a], walkNodes[b]);
      const start =
        horizontalDistance(point, walkNodes[a]) + distances[a] <
        horizontalDistance(point, walkNodes[b]) + distances[b]
          ? a
          : b;
      return {
        point,
        start,
        distance: horizontalDistance(p, point) + Math.abs(p[1] - point[1]) * 2,
      };
    })
    .toSorted((a, b) => a.distance - b.distance)[0];
  const path: WalkPoint[] = [attached.point];
  let node: string | undefined = attached.start;
  while (node) {
    path.push(walkNodes[node]);
    node = next[node];
  }
  return path;
}
