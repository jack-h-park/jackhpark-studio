import type { PlayDestination } from "@/content/pm-intelligence-world/activities";

export function shouldOperateInstrument(
  destination: PlayDestination,
  delta: readonly [number, number],
): boolean {
  if (Math.hypot(...delta) <= 6) return true;
  return (
    (destination === "questions" || destination === "decisions") &&
    Math.abs(delta[0]) >= 24 &&
    Math.abs(delta[0]) > Math.abs(delta[1]) * 1.5
  );
}

export function ownsInstrumentPointer(
  owner: number | undefined,
  incoming: number,
): boolean {
  return owner === undefined || owner === incoming;
}
