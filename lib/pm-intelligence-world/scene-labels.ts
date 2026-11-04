import { type Camera, Vector3 } from "three";

import type { SectionId } from "@/content/pm-intelligence-world/types";

export const stationIds = [
  "inputs",
  "knowledge",
  "writing",
  "questions",
  "learning",
  "decisions",
] as const;
export type StationId = (typeof stationIds)[number];
export const spatialLabels: ReadonlyArray<{
  id: StationId;
  label: string;
  qualifier: string;
  height: number;
}> = [
  {
    id: "inputs",
    label: "Three inputs",
    qualifier: "Signals · projects · study",
    height: 2.8,
  },
  {
    id: "knowledge",
    label: "Knowledge",
    qualifier: "Record · review · reuse",
    height: 3.7,
  },
  {
    id: "writing",
    label: "Viewpoints",
    qualifier: "Write & refine",
    height: 1.8,
  },
  {
    id: "questions",
    label: "Explanations",
    qualifier: "Source-linked drafts",
    height: 2.6,
  },
  {
    id: "learning",
    label: "Study & practice",
    qualifier: "Prepare for challenges",
    height: 1.8,
  },
  {
    id: "decisions",
    label: "Product decisions",
    qualifier: "On request",
    height: 2.3,
  },
];
export function projectSceneLabel(
  position: readonly [number, number, number],
  camera: Camera,
  size: { width: number; height: number },
): { x: number; y: number; visible: boolean } {
  const projected = new Vector3(...position).project(camera);
  return {
    x: ((projected.x + 1) * size.width) / 2,
    y: ((1 - projected.y) * size.height) / 2,
    visible:
      size.width > 0 &&
      size.height > 0 &&
      Number.isFinite(projected.x) &&
      Math.abs(projected.x) < 1 &&
      Math.abs(projected.y) < 1 &&
      projected.z > -1 &&
      projected.z < 1,
  };
}
export type SceneLabelElements = Partial<Record<SectionId, HTMLButtonElement>>;

export type SceneLeaderElements = Partial<Record<SectionId, SVGLineElement>>;
interface LabelBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}
export function resolveLabelLayout(
  boxes: readonly LabelBox[],
  size: { width: number; height: number },
): LabelBox[] {
  const placed: LabelBox[] = [];
  const margin = 6,
    gap = 6;
  for (const box of boxes) {
    if (!box.visible) {
      placed.push({ ...box });
      continue;
    }
    const candidates: LabelBox[] = [];
    for (let radius = 0; radius < 8; radius++)
      for (const [dx, dy] of [
        [0, -radius],
        [0, radius],
        [-radius, 0],
        [radius, 0],
        [-radius, -radius],
        [radius, radius],
      ]) {
        const x = Math.max(
          box.width / 2 + margin,
          Math.min(
            size.width - box.width / 2 - margin,
            box.x + dx * (box.width + gap),
          ),
        );
        const y = Math.max(
          box.height + margin,
          Math.min(size.height - margin, box.y + dy * (box.height + gap)),
        );
        candidates.push({ ...box, x, y });
      }
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - box.x, a.y - box.y) -
        Math.hypot(b.x - box.x, b.y - box.y),
    );
    const candidate = candidates.find(
      (a) =>
        a.x + a.width / 2 <= size.width - margin &&
        a.y <= size.height - margin &&
        placed.every(
          (b) =>
            !b.visible ||
            Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + gap ||
            a.y + gap <= b.y - b.height ||
            b.y + gap <= a.y - a.height,
        ),
    );
    placed.push(candidate || { ...box, visible: false });
  }
  return placed;
}
