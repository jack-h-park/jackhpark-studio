import type { InputId, SectionId } from "@/content/pm-intelligence-world/types";

export const observatoryLocations = [
  {
    id: "signals",
    label: "Signal terrace",
    short: "Signals",
    section: "inputs",
    position: [-0.2, 0.5, 8.8],
    anchor: [-0.2, 2.4, 7.7],
  },
  {
    id: "review",
    label: "Human review",
    short: "Review",
    section: "roles",
    position: [5.1, 0.8, 7.2],
    anchor: [6.6, 2.9, 6.5],
  },
  {
    id: "knowledge",
    label: "Knowledge observatory",
    short: "Knowledge",
    section: "knowledge",
    position: [-1, 3.8, 1],
    anchor: [0, 11.9, -3.5],
  },
  {
    id: "writing",
    label: "Writing pavilion",
    short: "Writing",
    section: "writing",
    position: [-7.5, 5, -6.5],
    anchor: [-9, 8.5, -6.5],
  },
  {
    id: "questions",
    label: "PM question library",
    short: "Questions",
    section: "questions",
    position: [5.5, 5, -7],
    anchor: [7, 8.5, -7],
  },
  {
    id: "learning",
    label: "Learning greenhouse",
    short: "Learning",
    section: "learning",
    position: [8, 3.3, -1.5],
    anchor: [10, 6.4, -1.5],
  },
  {
    id: "decisions",
    label: "Decision lookout",
    short: "Decisions",
    section: "decisions",
    position: [10, 1.65, 3],
    anchor: [11, 5.2, 4],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  short: string;
  section: SectionId;
  position: readonly [number, number, number];
  anchor: readonly [number, number, number];
}>;
export type ObservatoryLocation = (typeof observatoryLocations)[number]["id"];
export interface ObservatoryState {
  location: ObservatoryLocation;
  selected: InputId | null;
  inspected: InputId[];
  reviewed: InputId[];
  connected: InputId[];
}
export const initialObservatoryState: ObservatoryState = {
  location: "signals",
  selected: null,
  inspected: [],
  reviewed: [],
  connected: [],
};
export type ObservatoryAction =
  | { type: "MOVE"; location: ObservatoryLocation }
  | { type: "SELECT"; input: InputId }
  | { type: "INSPECT" | "REVIEW" | "CONNECT" | "RESET" };
export function observatoryReducer(
  s: ObservatoryState,
  a: ObservatoryAction,
): ObservatoryState {
  if (a.type === "RESET") return initialObservatoryState;
  if (a.type === "MOVE") return { ...s, location: a.location };
  if (a.type === "SELECT")
    return { ...s, selected: a.input, location: "signals" };
  if (!s.selected) return s;
  const add = (list: InputId[]) =>
    list.includes(s.selected!) ? list : [...list, s.selected!];
  if (a.type === "INSPECT" && s.location === "signals")
    return { ...s, inspected: add(s.inspected) };
  if (
    a.type === "REVIEW" &&
    s.location === "review" &&
    s.inspected.includes(s.selected)
  )
    return { ...s, reviewed: add(s.reviewed) };
  if (
    a.type === "CONNECT" &&
    s.location === "knowledge" &&
    s.reviewed.includes(s.selected)
  )
    return { ...s, connected: add(s.connected) };
  return s;
}
