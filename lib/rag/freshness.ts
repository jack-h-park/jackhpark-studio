/**
 * Staleness decision for the RAG corpus.
 *
 * Kept apart from the route that serves it so the judgement can be exercised directly:
 * "has the ingest stopped running" is the whole point of the endpoint, and it should not be
 * something only an HTTP call can check.
 */

/** The ingest cron is daily; a day and a half allows one missed run plus clock drift. */
export const DEFAULT_STALE_AFTER_HOURS = 36;

/**
 * The lanes the scheduled ingest covers, keyed by the `scope` their runs record.
 *
 * A lane is watched only if something schedules it. Adding one here without scheduling it
 * produces an alarm that is right on day one and ignored by day three, so the two changes
 * belong together.
 */
export const FRESHNESS_LANES = {
  workspace: "Notion workspace",
  interview_bank: "Interview Q&A bank",
} as const;

export type FreshnessLane = keyof typeof FRESHNESS_LANES;

export type FreshnessVerdict = {
  stale: boolean;
  /** Null when nothing has ever succeeded. */
  hoursSinceLastSuccess: number | null;
  reason: "never-succeeded" | "stale" | "fresh";
};

/** True when any lane is stale — what an alarm should act on. */
export function anyLaneStale(
  verdicts: Partial<Record<FreshnessLane, FreshnessVerdict>>,
): boolean {
  return Object.values(verdicts).some((verdict) => verdict?.stale === true);
}

export function hoursBetween(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return (now - then) / 3_600_000;
}

export function resolveStaleAfterHours(
  raw: string | undefined = process.env.RAG_STALE_AFTER_HOURS,
): number {
  const parsed = Number.parseFloat(raw ?? "");
  // A malformed override must not silently disable the alarm by making the window huge or
  // negative; fall back rather than trust it.
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_STALE_AFTER_HOURS;
}

export function judgeFreshness({
  lastSuccessAt,
  staleAfterHours = DEFAULT_STALE_AFTER_HOURS,
  now = Date.now(),
}: {
  lastSuccessAt: string | null;
  staleAfterHours?: number;
  now?: number;
}): FreshnessVerdict {
  const hours = hoursBetween(lastSuccessAt, now);

  // No successful run on record is stale by definition. The corpus may be fine, but nothing
  // here can vouch for it, and silence is the state this exists to break.
  if (hours === null) {
    return { stale: true, hoursSinceLastSuccess: null, reason: "never-succeeded" };
  }

  return {
    stale: hours > staleAfterHours,
    hoursSinceLastSuccess: Math.round(hours * 10) / 10,
    reason: hours > staleAfterHours ? "stale" : "fresh",
  };
}
