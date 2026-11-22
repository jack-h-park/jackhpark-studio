import type { InputId } from "@/content/pm-intelligence-world/types";
import {
  activityDefinitions,
  type PlayDestination,
} from "@/content/pm-intelligence-world/activities";

import {
  initialObservatoryState,
  observatoryLocations,
  observatoryReducer,
  type ObservatoryState,
} from "./observatory-state";

export const observatorySessionKey = "pm-intelligence:observatory:v1";
const inputs: InputId[] = [
  "external-signals",
  "hands-on-projects",
  "market-study",
];
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const receipt = (value: unknown): value is InputId[] =>
  Array.isArray(value) &&
  value.length <= 3 &&
  new Set(value).size === value.length &&
  value.every((v) => typeof v === "string" && inputs.includes(v as InputId));

// Replay authored choices through the reducer so storage cannot bypass review gates.
export function restoreObservatorySession(
  raw: string | null,
): ObservatoryState {
  try {
    if (!raw || raw.length > 32_000) return initialObservatoryState;
    const envelope: unknown = JSON.parse(raw);
    if (!object(envelope) || envelope.version !== 1 || !object(envelope.state))
      return initialObservatoryState;
    const s = envelope.state;
    const { inspected, reviewed, connected } = s;
    if (
      !receipt(inspected) ||
      !receipt(reviewed) ||
      !receipt(connected) ||
      !reviewed.every((i) => inspected.includes(i)) ||
      !connected.every((i) => reviewed.includes(i)) ||
      !object(s.activities) ||
      !observatoryLocations.some((l) => l.id === s.location) ||
      (s.selected !== null && !inputs.includes(s.selected as InputId))
    )
      return initialObservatoryState;
    let state = initialObservatoryState;
    for (const input of inputs) {
      state = observatoryReducer(state, { type: "SELECT", input });
      if (inspected.includes(input))
        state = observatoryReducer(state, { type: "INSPECT" });
      state = observatoryReducer(state, { type: "MOVE", location: "review" });
      if (reviewed.includes(input))
        state = observatoryReducer(state, { type: "REVIEW" });
      state = observatoryReducer(state, {
        type: "MOVE",
        location: "knowledge",
      });
      if (connected.includes(input))
        state = observatoryReducer(state, { type: "CONNECT" });
      const activities = s.activities[input];
      if (activities === undefined) continue;
      if (!object(activities) || !connected.includes(input))
        return initialObservatoryState;
      for (const [key, progress] of Object.entries(activities)) {
        if (!Object.hasOwn(activityDefinitions, key) || !object(progress))
          return initialObservatoryState;
        const destination = key as PlayDestination;
        const definition = activityDefinitions[destination];
        if (
          !Array.isArray(progress.choices) ||
          progress.choices.length > definition.stages.length ||
          progress.step !== progress.choices.length ||
          typeof progress.reason !== "string" ||
          progress.reason.length > 600 ||
          typeof progress.acknowledged !== "boolean" ||
          typeof progress.completed !== "boolean" ||
          typeof progress.feedback !== "string"
        )
          return initialObservatoryState;
        state = observatoryReducer(state, {
          type: "MOVE",
          location: destination,
        });
        for (const [index, choice] of progress.choices.entries()) {
          if (
            !definition.stages[index]?.options.some(
              (o) => o.id === choice && o.accepted,
            )
          )
            return initialObservatoryState;
          state = observatoryReducer(state, {
            type: "PLAY",
            choice: choice as string,
          });
        }
        state = observatoryReducer(state, {
          type: "ACTIVITY_REASON",
          reason: progress.reason,
        });
        state = observatoryReducer(state, {
          type: "ACTIVITY_ACK",
          acknowledged: progress.acknowledged,
        });
        if (progress.completed)
          state = observatoryReducer(state, { type: "FINISH_ACTIVITY" });
        if (progress.armedChoice !== undefined) {
          if (
            typeof progress.armedChoice !== "string" ||
            !definition.stages[progress.step as number]?.options.some(
              (o) => o.id === progress.armedChoice,
            )
          )
            return initialObservatoryState;
          state = observatoryReducer(state, {
            type: "ARM_ACTIVITY",
            choice: progress.armedChoice,
          });
        }
        const restored = state.activities[input]?.[destination];
        if (
          !restored ||
          restored.completed !== progress.completed ||
          (progress.operations !== undefined &&
            (!Number.isSafeInteger(progress.operations) ||
              (progress.operations as number) < 0))
        )
          return initialObservatoryState;
        const feedback = progress.feedback;
        if (
          feedback !== "" &&
          !definition.stages.some((stage) =>
            stage.options.some((o) => o.feedback === feedback),
          )
        )
          return initialObservatoryState;
        state = {
          ...state,
          activities: {
            ...state.activities,
            [input]: {
              ...state.activities[input],
              [destination]: {
                ...restored,
                feedback,
                operations: progress.operations as number | undefined,
              },
            },
          },
        };
      }
    }
    return {
      ...state,
      selected: s.selected as InputId | null,
      location: s.location as ObservatoryState["location"],
      travel: 1,
    };
  } catch {
    return initialObservatoryState;
  }
}

export function saveObservatorySession(
  storage: Pick<Storage, "setItem" | "removeItem">,
  state: ObservatoryState,
): void {
  try {
    if (state === initialObservatoryState)
      storage.removeItem(observatorySessionKey);
    else
      storage.setItem(
        observatorySessionKey,
        JSON.stringify({ version: 1, state }),
      );
  } catch {
    // Storage can be unavailable; the in-page expedition must remain usable.
  }
}
