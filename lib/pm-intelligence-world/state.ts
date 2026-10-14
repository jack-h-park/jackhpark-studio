import type {
  DecisionChoice,
  InputId,
  Mode,
  RecordId,
  SectionId,
} from "@/content/pm-intelligence-world/types";

export interface ExperienceState {
  mode: Mode;
  section: SectionId;
  selectedInput: InputId | null;
  selectedRecord: RecordId | null;
  decision: { entered: boolean; choice: DecisionChoice | null; reason: string };
}
export type ExperienceAction =
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
export function experienceReducer(
  s: ExperienceState,
  a: ExperienceAction,
): ExperienceState {
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
}
