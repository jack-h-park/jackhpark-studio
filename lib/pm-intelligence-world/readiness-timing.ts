const phases = [
  "scene-start",
  "model-loaded",
  "model-parsed",
  "shaders-ready",
  "first-frame",
  "interactive",
] as const;
type Phase = (typeof phases)[number];
interface TimingClock {
  now(): number;
  mark(name: string): unknown;
  measure(name: string, options: { start: number; end: number }): unknown;
  clearMarks?(name: string): void;
  clearMeasures?(name: string): void;
}

export function createReadinessTiming(
  clock: TimingClock | undefined = typeof performance === "undefined"
    ? undefined
    : performance,
) {
  let active = !!clock;
  let start = 0;
  const seen = new Set<Phase>();
  try {
    if (clock) {
      start = clock.now();
      // Retain the latest scene attempt rather than grow the browser timeline on
      // repeated deck returns. Numeric timestamps prevent cross-instance pairing.
      for (const phase of phases) {
        clock.clearMarks?.(`pm-world:${phase}`);
        clock.clearMeasures?.(`pm-world:${phase}:navigation`);
        clock.clearMeasures?.(`pm-world:${phase}:scene`);
      }
    }
  } catch {
    active = false;
  }
  const record = (phase: Phase) => {
    if (!active || !clock || seen.has(phase)) return;
    seen.add(phase);
    try {
      const end = clock.now();
      clock.mark(`pm-world:${phase}`);
      clock.measure(`pm-world:${phase}:navigation`, { start: 0, end });
      clock.measure(`pm-world:${phase}:scene`, { start, end });
    } catch {
      // User Timing is observational; unavailable diagnostics must never affect play.
      active = false;
    }
  };
  record("scene-start");
  return {
    record,
    dispose: () => {
      active = false;
    },
  };
}
