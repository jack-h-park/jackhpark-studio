import type {
  InputId,
  RecordId,
  SectionId,
} from "@/content/pm-intelligence-world/types";

export interface SceneSelection {
  section: SectionId;
  illuminated?: readonly SectionId[];
  selectedInput: InputId | null;
  selectedRecord: RecordId | null;
}
type Pose = {
  position: [number, number, number];
  camera: [number, number, number];
};
export const sceneLayout: Record<SectionId, Pose> = {
  overview: { position: [0, 0, 0], camera: [13, 14, 17] },
  inputs: { position: [-6, 0, 0], camera: [5, 11, 15] },
  knowledge: { position: [0, 0, 0], camera: [10, 11, 13] },
  writing: { position: [5, 0, -5], camera: [14, 11, 8] },
  questions: { position: [7, 0, -1.5], camera: [16, 11, 12] },
  learning: { position: [6, 0, 3], camera: [15, 11, 16] },
  decisions: { position: [3.5, 0, 6.5], camera: [13, 11, 19] },
  roles: { position: [0, 0, 0], camera: [13, 14, 17] },
  limits: { position: [0, 0, 0], camera: [16, 17, 21] },
};
