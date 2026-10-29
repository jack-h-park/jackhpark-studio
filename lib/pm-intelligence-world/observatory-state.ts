import type { InputId, SectionId } from "@/content/pm-intelligence-world/types";
import {
  activityDefinitions,
  isPlayDestination,
  type PlayDestination,
} from "@/content/pm-intelligence-world/activities";

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
    position: [5.5, 0.8, 7.4],
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
    position: [-7.25, 5, -6.5],
    anchor: [-9, 8.5, -6.5],
  },
  {
    id: "questions",
    label: "PM question library",
    short: "Questions",
    section: "questions",
    position: [5.25, 5, -7],
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
export interface ActivityProgress {
  armedChoice?: string;
  operations?: number;
  step: number;
  choices: string[];
  feedback: string;
  reason: string;
  acknowledged: boolean;
  completed: boolean;
}
export const emptyActivity: ActivityProgress = {
  step: 0,
  choices: [],
  feedback: "",
  reason: "",
  acknowledged: false,
  completed: false,
};
export interface ObservatoryState {
  travel: number;
  activities: Partial<
    Record<InputId, Partial<Record<PlayDestination, ActivityProgress>>>
  >;
  location: ObservatoryLocation;
  selected: InputId | null;
  inspected: InputId[];
  reviewed: InputId[];
  connected: InputId[];
}
export const initialObservatoryState: ObservatoryState = {
  travel: 0,
  activities: {},
  location: "signals",
  selected: null,
  inspected: [],
  reviewed: [],
  connected: [],
};
export type ObservatoryAction =
  | { type: "PLAY" | "ARM_ACTIVITY"; choice: string }
  | { type: "OPERATE_ACTIVITY" }
  | { type: "ACTIVITY_REASON"; reason: string }
  | { type: "ACTIVITY_ACK"; acknowledged: boolean }
  | { type: "FINISH_ACTIVITY" | "RETRY_ACTIVITY" }
  | { type: "MOVE"; location: ObservatoryLocation }
  | { type: "SELECT"; input: InputId }
  | { type: "INSPECT" | "REVIEW" | "CONNECT" | "RESET" };
export function observatoryReducer(
  s: ObservatoryState,
  a: ObservatoryAction,
): ObservatoryState {
  if (a.type === "RESET") return initialObservatoryState;
  if (a.type === "MOVE")
    return { ...s, location: a.location, travel: s.travel + 1 };
  if (a.type === "SELECT")
    return {
      ...s,
      selected: a.input,
      location: "signals",
      travel: s.travel + 1,
    };
  if (!s.selected) return s;
  if (
    [
      "PLAY",
      "ARM_ACTIVITY",
      "OPERATE_ACTIVITY",
      "ACTIVITY_REASON",
      "ACTIVITY_ACK",
      "FINISH_ACTIVITY",
      "RETRY_ACTIVITY",
    ].includes(a.type)
  ) {
    if (!isPlayDestination(s.location) || !s.connected.includes(s.selected))
      return s;
    const location = s.location,
      definition = activityDefinitions[location];
    const old = s.activities[s.selected]?.[location] ?? emptyActivity;
    let progress = old;
    if (a.type === "RETRY_ACTIVITY") progress = { ...emptyActivity };
    else if (old.completed) return s;
    else if (a.type === "ARM_ACTIVITY") {
      if (!definition.stages[old.step]?.options.some((o) => o.id === a.choice))
        return s;
      progress = { ...old, armedChoice: a.choice, feedback: "" };
    } else if (a.type === "PLAY" || a.type === "OPERATE_ACTIVITY") {
      const choice = a.type === "PLAY" ? a.choice : old.armedChoice;
      const option = definition.stages[old.step]?.options.find(
        (o) => o.id === choice,
      );
      if (!option) return s;
      const step = option.accepted ? old.step + 1 : old.step;
      progress = {
        ...old,
        step,
        armedChoice: option.accepted ? undefined : old.armedChoice,
        ...(a.type === "OPERATE_ACTIVITY"
          ? { operations: (old.operations ?? 0) + 1 }
          : {}),
        feedback: option.feedback,
        choices: option.accepted ? [...old.choices, option.id] : old.choices,
        completed:
          location !== "decisions" && step === definition.stages.length,
      };
    } else if (a.type === "ACTIVITY_REASON")
      progress = { ...old, reason: a.reason.slice(0, 600) };
    else if (a.type === "ACTIVITY_ACK")
      progress = { ...old, acknowledged: a.acknowledged };
    else if (
      a.type === "FINISH_ACTIVITY" &&
      location === "decisions" &&
      old.step === definition.stages.length &&
      old.reason.trim().length >= 12 &&
      old.acknowledged
    )
      progress = { ...old, completed: true };
    if (progress === old) return s;
    return {
      ...s,
      activities: {
        ...s.activities,
        [s.selected]: { ...s.activities[s.selected], [location]: progress },
      },
    };
  }
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
