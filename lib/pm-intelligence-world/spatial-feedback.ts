import type { InputId } from "@/content/pm-intelligence-world/types";
import {
  activityDefinitions,
  isPlayDestination,
} from "@/content/pm-intelligence-world/activities";

import {
  emptyActivity,
  type ObservatoryLocation,
  type ObservatoryState,
} from "./observatory-state";

export type SpatialFeedback = {
  kind:
    | "inspected"
    | "reviewed"
    | "connected"
    | "accepted"
    | "revise"
    | "completed";
  location: ObservatoryLocation;
  source: InputId;
};

/** Presentation events are differences in reducer receipts, never a second progress store. */
export function feedbackTransition(
  before: ObservatoryState,
  after: ObservatoryState,
): SpatialFeedback | null {
  const source = after.selected;
  if (!source || source !== before.selected) return null;
  if (after.connected.includes(source) && !before.connected.includes(source))
    return { kind: "connected", location: "knowledge", source };
  if (after.reviewed.includes(source) && !before.reviewed.includes(source))
    return { kind: "reviewed", location: "review", source };
  if (after.inspected.includes(source) && !before.inspected.includes(source))
    return { kind: "inspected", location: "signals", source };
  const location = after.location;
  if (!isPlayDestination(location) || !after.connected.includes(source))
    return null;
  const old = before.activities[source]?.[location] ?? emptyActivity;
  const next = after.activities[source]?.[location] ?? emptyActivity;
  if (next === old) return null;
  if (!old.completed && next.completed)
    return { kind: "completed", location, source };
  if (next.step > old.step) return { kind: "accepted", location, source };
  const rejected = activityDefinitions[location].stages[
    next.step
  ]?.options.some(
    (option) => !option.accepted && option.feedback === next.feedback,
  );
  if (
    next.step === old.step &&
    rejected &&
    next.feedback &&
    ((next.operations ?? 0) > (old.operations ?? 0) ||
      (next.reason === old.reason &&
        next.acknowledged === old.acknowledged &&
        next.armedChoice === old.armedChoice))
  )
    return { kind: "revise", location, source };
  return null;
}

export function clearsSpatialFeedback(
  before: ObservatoryState,
  after: ObservatoryState,
): boolean {
  if (before.selected !== after.selected) return true;
  const source = after.selected,
    location = after.location;
  if (!source || !isPlayDestination(location)) return false;
  const old = before.activities[source]?.[location] ?? emptyActivity;
  const next = after.activities[source]?.[location] ?? emptyActivity;
  return (
    next.step < old.step ||
    (old.completed && !next.completed) ||
    (next.operations ?? 0) < (old.operations ?? 0) ||
    (!!old.feedback && !next.feedback && !next.armedChoice && next.step === 0)
  );
}
