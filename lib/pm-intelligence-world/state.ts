import type {
  DecisionChoice,
  InputId,
  Mode,
  RecordId,
  SectionId,
} from "@/content/pm-intelligence-world/types";

import {
  appendUnique,
  type DiscoveryAction,
  discoveryReducer,
  type DiscoveryState,
  emptyDiscovery,
} from "./discovery";

export interface ExperienceState {
  discovery: DiscoveryState;
  mode: Mode;
  section: SectionId;
  selectedInput: InputId | null;
  selectedRecord: RecordId | null;
  decision: { entered: boolean; choice: DecisionChoice | null; reason: string };
}
export type ExperienceAction =
  | DiscoveryAction
  | { type: "SET_MODE"; mode: Mode }
  | { type: "FOCUS_SECTION"; section: SectionId }
  | { type: "SELECT_INPUT"; input: InputId | null }
  | { type: "OPEN_RECORD"; record: RecordId }
  | { type: "CLOSE_RECORD" }
  | { type: "NEXT" }
  | { type: "PREVIOUS" }
  | { type: "ENTER_DECISION" }
  | { type: "CHOOSE_DECISION"; choice: DecisionChoice }
  | { type: "SET_REASON"; reason: string }
  | { type: "RESET_DECISION" };
export const initialState: ExperienceState = {
  discovery: emptyDiscovery,
  mode: "quick",
  section: "overview",
  selectedInput: null,
  selectedRecord: null,
  decision: { entered: false, choice: null, reason: "" },
};
const quick: readonly SectionId[] = [
  "overview",
  "inputs",
  "knowledge",
  "questions",
  "roles",
  "limits",
];
const guide: readonly SectionId[] = [
  "overview",
  "inputs",
  "knowledge",
  "writing",
  "questions",
  "learning",
  "roles",
  "limits",
];
export function getSequence(mode: Mode): readonly SectionId[] {
  return mode === "guide" ? guide : quick;
}
function reduceExperience(
  s: ExperienceState,
  a: ExperienceAction,
): ExperienceState {
  switch (a.type) {
    case "START_DISCOVERY":
    case "RESET_DISCOVERY":
    case "CONNECT_RECORDS":
    case "INSPECT_TRAIL_RECORD":
    case "REVEAL_USE":
    case "INSPECT_ROLE":
    case "ACKNOWLEDGE_REVIEW": {
      const discovery = discoveryReducer(s.discovery, a);
      return a.type === "START_DISCOVERY"
        ? {
            ...s,
            discovery,
            mode: "explore",
            section: "inputs",
            selectedRecord: null,
          }
        : { ...s, discovery };
    }
  }
  if (s.discovery.started) {
    const d = s.discovery;
    if (a.type === "SELECT_INPUT" && a.input)
      s = {
        ...s,
        discovery: { ...d, inputs: appendUnique(d.inputs, a.input) },
      };
    if (a.type === "OPEN_RECORD")
      s = {
        ...s,
        discovery: { ...d, records: appendUnique(d.records, a.record) },
      };
    if (a.type === "FOCUS_SECTION")
      s = {
        ...s,
        discovery: { ...d, visited: appendUnique(d.visited, a.section) },
      };
  }
  switch (a.type) {
    case "SET_MODE":
      return {
        ...s,
        mode: a.mode,
        section:
          a.mode === "explore" || getSequence(a.mode).includes(s.section)
            ? s.section
            : "overview",
      };
    case "FOCUS_SECTION":
      return { ...s, section: a.section, selectedRecord: null };
    case "SELECT_INPUT":
      return { ...s, selectedInput: a.input };
    case "OPEN_RECORD":
      return { ...s, selectedRecord: a.record };
    case "CLOSE_RECORD":
      return { ...s, selectedRecord: null };
    case "ENTER_DECISION":
      return { ...s, decision: { ...s.decision, entered: true } };
    case "CHOOSE_DECISION":
      return s.decision.entered
        ? { ...s, decision: { ...s.decision, choice: a.choice } }
        : s;
    case "SET_REASON":
      return s.decision.entered
        ? { ...s, decision: { ...s.decision, reason: a.reason.slice(0, 600) } }
        : s;
    case "RESET_DECISION":
      return { ...s, decision: { entered: false, choice: null, reason: "" } };
    case "NEXT":
    case "PREVIOUS": {
      if (s.mode === "explore") return s;
      const q = getSequence(s.mode);
      return {
        ...s,
        section:
          q[
            Math.max(
              0,
              Math.min(
                q.length - 1,
                q.indexOf(s.section) + (a.type === "NEXT" ? 1 : -1),
              ),
            )
          ],
        selectedRecord: null,
      };
    }
  }
  return s;
}

export function experienceReducer(
  state: ExperienceState,
  action: ExperienceAction,
): ExperienceState {
  const next = reduceExperience(state, action);
  if (!next.discovery.started) return next;
  return {
    ...next,
    discovery: {
      ...next.discovery,
      visited: appendUnique(next.discovery.visited, next.section),
    },
  };
}
