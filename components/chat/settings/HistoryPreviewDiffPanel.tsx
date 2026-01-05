import { FiActivity } from "@react-icons/all-files/fi/FiActivity";
import { FiClipboard } from "@react-icons/all-files/fi/FiClipboard";
import { FiTrash2 } from "@react-icons/all-files/fi/FiTrash2";
import { useEffect, useState } from "react";

import {
  clearDiffTelemetry,
  type DiffTelemetrySnapshot,
  getDiffTelemetrySnapshot,
  type HistoryPreviewDiffEvent,
} from "@/lib/chat/historyPreviewDiffTelemetry";
import { isDevOnly } from "@/lib/dev/devFlags";

export function HistoryPreviewDiffPanel() {
  const [snapshot, setSnapshot] = useState<DiffTelemetrySnapshot | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Poll for updates (simple approach for dev tool)
  useEffect(() => {
    if (!isDevOnly()) return;

    const update = () => setSnapshot(getDiffTelemetrySnapshot());
    update();
    const interval = setInterval(update, 1000); // 1s poll
    return () => clearInterval(interval);
  }, []);

  if (!snapshot || snapshot.totalDiffs === 0) return null;

  const handleCopy = () => {
    void navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
  };

  const handleClear = () => {
    clearDiffTelemetry();
    setSnapshot(getDiffTelemetrySnapshot());
  };

  return (
    <div className="mt-4 border-t border-[var(--ai-divider)] pt-2">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--ai-text-warning)]">
          <FiActivity />
          <span>Diffs detected: {snapshot.totalDiffs}</span>
        </div>
        <span className="text-[10px] text-[var(--ai-text-muted)] hover:text-[var(--ai-text-default)] underline">
          {isOpen ? "Hide telemetry" : "Show telemetry"}
        </span>
      </div>

      {isOpen && (
        <div className="mt-2 text-[10px] space-y-2 bg-[var(--ai-bg-surface-sunken)] p-2 rounded border border-[var(--ai-border-subtle)]">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--ai-divider)]/50 mb-2">
            <div>
              <div className="text-[var(--ai-text-muted)]">Last diff:</div>
              <div className="font-mono text-[var(--ai-text-default)]">
                {snapshot.lastDiffAt
                  ? new Date(snapshot.lastDiffAt).toLocaleTimeString()
                  : "-"}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--ai-bg-surface-default)] border border-[var(--ai-border-subtle)] hover:bg-[var(--ai-bg-surface-hove)] transition-colors"
                title="Copy JSON snapshot"
              >
                <FiClipboard /> Copy
              </button>
              <button
                onClick={handleClear}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--ai-bg-surface-default)] border border-[var(--ai-border-subtle)] hover:bg-red-500/10 hover:text-red-500 transition-colors"
                title="Clear logs"
              >
                <FiTrash2 /> Clear
              </button>
            </div>
          </div>

          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {snapshot.recent.slice(0, 10).map((event, i) => (
              <LogItem key={event.ts + i} event={event} />
            ))}
            {snapshot.recent.length > 10 && (
              <div className="text-center italic text-[var(--ai-text-muted)] pt-1">
                ...and {snapshot.recent.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LogItem({ event }: { event: HistoryPreviewDiffEvent }) {
  const isIndexDiff =
    event.diff.type === "indices" || event.diff.type === "both";

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 p-1 hover:bg-[var(--ai-bg-surface-default)] rounded">
      <div className="font-mono text-[var(--ai-text-muted)] w-12 text-right">
        {new Date(event.ts).toLocaleTimeString([], {
          hour12: false,
          minute: "2-digit",
          second: "2-digit",
        })}
      </div>

      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--ai-text-default)] uppercase tracking-wider text-[9px] bg-[var(--ai-bg-surface-default)] px-1 rounded border border-[var(--ai-border-subtle)]">
            {event.reason}
          </span>
          {event.context.syntheticCount && event.context.syntheticCount > 0 && (
            <span className="text-[var(--ai-text-warning)] text-[9px]">
              +{event.context.syntheticCount} synthetic
            </span>
          )}
        </div>

        <div className="font-mono text-[var(--ai-text-muted)] flex gap-3">
          <span>Est: {event.estimate.includedCount}</span>
          <span>&rarr;</span>
          <span>Exact: {event.exact.includedCount}</span>
          <span
            className={
              event.diff.includedCountDelta !== 0
                ? "text-[var(--ai-text-warning)]"
                : ""
            }
          >
            ({event.diff.includedCountDelta > 0 ? "+" : ""}
            {event.diff.includedCountDelta})
          </span>
        </div>

        {isIndexDiff && (
          <div className="text-[var(--ai-text-warning)] italic">
            Indices mismatch
          </div>
        )}
      </div>
    </div>
  );
}
