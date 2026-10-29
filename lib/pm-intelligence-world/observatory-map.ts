import { walkEdges, walkNodes, type WalkPoint } from "./observatory-navigation";

/** North-up plan of the authored campus, not a projection of the orbit camera. */
export function projectCampusPoint(
  point: WalkPoint,
): readonly [number, number] {
  return [20 + (point[0] + 10) * 10, 20 + (point[2] + 9) * 9];
}
export const campusMapPaths = walkEdges.map(
  ([a, b]) =>
    [
      projectCampusPoint(walkNodes[a]),
      projectCampusPoint(walkNodes[b]),
    ] as const,
);
