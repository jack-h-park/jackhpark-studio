import {
  activityDefinitions,
  type PlayDestination,
} from "@/content/pm-intelligence-world/activities";
import { exhibitDefinitions } from "@/content/pm-intelligence-world/exhibits";

import {
  type ActivityProgress,
  emptyActivity,
  type ObservatoryState,
} from "./observatory-state";

export function artifactSlots(
  destination: PlayDestination,
  progress: ActivityProgress = emptyActivity,
): boolean[] {
  const stages = activityDefinitions[destination].stages;
  return exhibitDefinitions[destination].slots.map((_, i) => {
    if (i < stages.length)
      return stages[i].options.some(
        (o) => o.accepted && o.id === progress.choices[i],
      );
    if (destination === "decisions")
      return i === 1
        ? progress.reason.trim().length >= 12
        : progress.acknowledged;
    return false;
  });
}
export function getExhibitState(
  destination: PlayDestination,
  state: ObservatoryState,
) {
  const available =
    !!state.selected && state.connected.includes(state.selected);
  const progress =
    available && state.selected
      ? state.activities[state.selected]?.[destination]
      : undefined;
  return {
    available,
    slots: artifactSlots(destination, progress),
    completed: !!progress?.completed,
  };
}
export function nextMainUse(state: ObservatoryState): PlayDestination | null {
  return (
    (["writing", "questions", "learning"] as const).find(
      (id) => !getExhibitState(id, state).completed,
    ) ?? null
  );
}
