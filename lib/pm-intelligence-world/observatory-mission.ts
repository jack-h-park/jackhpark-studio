import { isPlayDestination } from "@/content/pm-intelligence-world/activities";

import type {
  ObservatoryLocation,
  ObservatoryState,
} from "./observatory-state";

const milestones = [
  {
    destination: "signals",
    title: "Find a source. Keep its context.",
    clue: "Start on the lower terrace. Choose any of the three input families.",
    action: "Inspect a source",
  },
  {
    destination: "review",
    title: "Carry the limits to human review.",
    clue: "The brass desk is across the lower bridge. Agents prepare; a person reviews.",
    action: "Review the source",
  },
  {
    destination: "knowledge",
    title: "Keep knowledge that can be revisited.",
    clue: "Climb the central path to the observatory. Retain the source and its limits together.",
    action: "Connect knowledge",
  },
  {
    destination: "writing",
    title: "Turn an observation into a bounded claim.",
    clue: "Follow the upper west path to the argument press.",
    action: "Operate the argument press",
  },
  {
    destination: "questions",
    title: "Trace an answer back to its source.",
    clue: "Cross the upper ring to the provenance instrument in the library.",
    action: "Operate the provenance instrument",
  },
  {
    destination: "learning",
    title: "Connect demand, study and practice.",
    clue: "Take the east bridge down to the learning greenhouse.",
    action: "Operate the learning garden",
  },
] satisfies Array<{
  destination: ObservatoryLocation;
  title: string;
  clue: string;
  action: string;
}>;

// The suggested journey is derived from the same receipts as every instrument.
// A destination visit alone never counts as a completed milestone.
export function expeditionMission(state: ObservatoryState) {
  const source = state.selected;
  const connected = !!source && state.connected.includes(source);
  const receipts = [
    !!source && state.inspected.includes(source),
    !!source && state.reviewed.includes(source),
    connected,
    ...(["writing", "questions", "learning"] as const).map(
      (id) =>
        connected && !!source && !!state.activities[source]?.[id]?.completed,
    ),
  ];
  const index = receipts.findIndex((done) => !done);
  const completed = receipts.filter(Boolean).length;
  if (index === -1)
    return {
      destination: "knowledge" as const,
      title: "One foundation. Three ways to use it.",
      clue: "Return to the observatory to retrace the system. Product Decision is an optional branch.",
      action: "Review the expedition",
      completed,
      receipts,
      complete: true,
      index: 6,
    };
  return {
    ...milestones[index],
    ...(!source
      ? {
          title: "Explore the PM Intelligence System.",
          clue: "Sources → human review → knowledge → writing, questions & learning.",
        }
      : {}),
    completed,
    receipts,
    complete: false,
    index,
  };
}

export function expeditionIntent(
  state: ObservatoryState,
  nearby: ObservatoryLocation | null,
) {
  const mission = expeditionMission(state);
  if (nearby !== mission.destination) return "travel";
  if (!state.selected) return "choose-source";
  if (
    state.connected.includes(state.selected) &&
    isPlayDestination(mission.destination)
  )
    return "instrument";
  return "context";
}
