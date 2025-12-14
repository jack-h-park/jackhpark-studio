import { isDevOnly } from "@/lib/dev/devFlags";

export type DiffReasonKey =
  | "preset"
  | "historyBudget"
  | "summary"
  | "reset"
  | "unknown";

export type HistoryPreviewDiffEvent = {
  ts: number;
  reason: DiffReasonKey;
  estimate: { includedCount: number; excludedCount: number };
  exact: { includedCount: number; excludedCount: number };
  diff: {
    type: "count" | "indices" | "both";
    includedCountDelta: number;
    excludedCountDelta: number;
    indicesLengthDelta?: number;
  };
  context: {
    totalMessages: number;
    historyTokenBudget: number;
    summaryReplacementEnabled?: boolean;
    presetId?: string;
    engineId?: string;
    syntheticCount?: number;
    includedOriginalCount?: number;
  };
};

export type DiffTelemetrySnapshot = {
  sessionStartedAt: number;
  totalDiffs: number;
  lastDiffAt?: number;
  lastReason?: DiffReasonKey;
  recent: HistoryPreviewDiffEvent[];
};

// In-memory store
let sessionStartedAt = Date.now();
const recentEvents: HistoryPreviewDiffEvent[] = [];
const MAX_EVENTS = 50;

// Track the last reason set by user interaction
let lastReason: DiffReasonKey = "unknown";

export function setLastDiffReason(reason: DiffReasonKey) {
  if (!isDevOnly()) return;
  lastReason = reason;
}

export function getLastDiffReason(): DiffReasonKey {
  // If reason is stale (>10s), revert to unknown? Optional logic.
  // For now, keep it simple.
  return lastReason;
}

export function recordDiffEvent(event: HistoryPreviewDiffEvent): void {
  if (!isDevOnly()) return;

  // Deduplicate: If exactly matches last event (except timestamp), skip
  const last = recentEvents[0];
  if (last) {
    const isDuplicate =
      last.reason === event.reason &&
      last.diff.type === event.diff.type &&
      last.diff.includedCountDelta === event.diff.includedCountDelta &&
      last.estimate.includedCount === event.estimate.includedCount &&
      last.exact.includedCount === event.exact.includedCount &&
      last.context.historyTokenBudget === event.context.historyTokenBudget;

    if (isDuplicate) return;
  }

  recentEvents.unshift(event);
  if (recentEvents.length > MAX_EVENTS) {
    recentEvents.pop();
  }

  // Optional: Sync to sessionStorage for persistence across reloads in dev
  try {
    sessionStorage.setItem(
      "historyPreviewDiffTelemetry:v1",
      JSON.stringify(getDiffTelemetrySnapshot()),
    );
  } catch {
    // Ignore storage errors
  }
}

export function getDiffTelemetrySnapshot(): DiffTelemetrySnapshot {
  return {
    sessionStartedAt,
    totalDiffs: recentEvents.length,
    lastDiffAt: recentEvents[0]?.ts,
    lastReason: recentEvents[0]?.reason,
    recent: [...recentEvents],
  };
}

export function clearDiffTelemetry(): void {
  recentEvents.length = 0;
  sessionStartedAt = Date.now();
  try {
    sessionStorage.removeItem("historyPreviewDiffTelemetry:v1");
  } catch {
    // Ignore
  }
}

// Initialize from storage if available
if (typeof window !== "undefined" && isDevOnly()) {
  try {
    const saved = sessionStorage.getItem("historyPreviewDiffTelemetry:v1");
    if (saved) {
      const parsed = JSON.parse(saved) as DiffTelemetrySnapshot;
      if (parsed && Array.isArray(parsed.recent)) {
        sessionStartedAt = parsed.sessionStartedAt || Date.now();
        recentEvents.push(...parsed.recent.slice(0, MAX_EVENTS));
      }
    }
  } catch {
    // Ignore
  }
}
