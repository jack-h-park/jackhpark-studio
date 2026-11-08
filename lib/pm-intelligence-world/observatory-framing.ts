import { type Box3, type OrthographicCamera, Vector3 } from "three";

export const observatoryZoomLimits = { min: 0.75, max: 8 } as const;

export interface PlayRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface PlayViewport {
  width: number;
  height: number;
}

/** Choose the largest clear rectangle, rather than assuming a particular panel height. */
export function clearPlayfield(
  viewport: PlayViewport,
  occluders: PlayRect[],
): PlayRect {
  let area: PlayRect = {
    left: 16,
    top: 16,
    right: viewport.width - 16,
    bottom: viewport.height - 16,
  };
  for (const obstacle of occluders) {
    if (
      obstacle.right <= area.left ||
      obstacle.left >= area.right ||
      obstacle.bottom <= area.top ||
      obstacle.top >= area.bottom
    )
      continue;
    const candidates = [
      { ...area, right: Math.min(area.right, obstacle.left - 12) },
      { ...area, left: Math.max(area.left, obstacle.right + 12) },
      { ...area, bottom: Math.min(area.bottom, obstacle.top - 12) },
      { ...area, top: Math.max(area.top, obstacle.bottom + 12) },
    ].filter((r) => r.right > r.left && r.bottom > r.top);
    if (candidates.length)
      area = candidates.reduce((best, r) =>
        (r.right - r.left) * (r.bottom - r.top) >
        (best.right - best.left) * (best.bottom - best.top)
          ? r
          : best,
      );
  }
  return area;
}

export function framePoint(
  camera: OrthographicCamera,
  point: Vector3,
  viewport: PlayViewport,
  playfield: PlayRect,
  zoom: number,
): Vector3 {
  camera.updateMatrixWorld();
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const x = (playfield.left + playfield.right) / 2 - viewport.width / 2;
  const y = (playfield.top + playfield.bottom) / 2 - viewport.height / 2;
  return point
    .clone()
    .addScaledVector(
      right,
      (-x * (camera.right - camera.left)) / (viewport.width * zoom),
    )
    .addScaledVector(
      up,
      (y * (camera.top - camera.bottom)) / (viewport.height * zoom),
    );
}

/** Fit the complete animated installation, keeping room around it for orbit and gestures. */
export function fitObjectFrame(
  camera: OrthographicCamera,
  bounds: Box3,
  viewport: PlayViewport,
  occluders: PlayRect[],
) {
  const playfield = clearPlayfield(viewport, occluders);
  camera.updateMatrixWorld();
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const xs: number[] = [],
    ys: number[] = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new Vector3(x, y, z);
        xs.push(corner.dot(right));
        ys.push(corner.dot(up));
      }
  const projectedWidth = Math.max(...xs) - Math.min(...xs),
    projectedHeight = Math.max(...ys) - Math.min(...ys);
  const zoom = Math.max(
    0.1,
    Math.min(
      observatoryZoomLimits.max,
      ((playfield.right - playfield.left) *
        0.72 *
        (camera.right - camera.left)) /
        (viewport.width * Math.max(projectedWidth, 0.01)),
      ((playfield.bottom - playfield.top) *
        0.74 *
        (camera.top - camera.bottom)) /
        (viewport.height * Math.max(projectedHeight, 0.01)),
    ),
  );
  return {
    target: framePoint(
      camera,
      bounds.getCenter(new Vector3()),
      viewport,
      playfield,
      zoom,
    ),
    zoom,
    playfield,
  };
}

/** Layout changes may frame an instrument; orbiting and pointer capture retain user control. */
export class CameraFramingGate {
  private automatic = true;
  private captured = false;
  private deferred = false;
  select() {
    this.automatic = true;
    this.captured = false;
    this.deferred = false;
  }
  orbit() {
    this.automatic = false;
    this.deferred = false;
  }
  begin() {
    this.captured = true;
  }
  request(): boolean {
    if (!this.automatic) return false;
    if (this.captured) {
      this.deferred = true;
      return false;
    }
    return true;
  }
  end(): boolean {
    this.captured = false;
    const resume = this.automatic && this.deferred;
    this.deferred = false;
    return resume;
  }
}
