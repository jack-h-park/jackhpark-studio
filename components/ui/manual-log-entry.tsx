import * as React from "react";

import { cn } from "./utils";

export type ManualLogLevel = "info" | "warn" | "error";

export type ManualLogEntryProps = {
  level: ManualLogLevel;
  timestamp: string;
  message: string;
  icon: React.ReactNode;
  className?: string;
};

const levelBorders: Record<ManualLogLevel, string> = {
  info: "border-l-4 border-l-[color:var(--ai-accent)]",
  warn: "border-l-4 border-l-[color:var(--ai-warning)]",
  error: "border-l-4 border-l-[color:var(--ai-error)]",
};

export function ManualLogEntry({
  level,
  timestamp,
  message,
  icon,
  className,
}: ManualLogEntryProps) {
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_1fr] gap-3 rounded-md bg-[color:var(--ai-bg)] px-3 py-3 shadow-[0_10px_30px_rgba(15,15,15,0.08)] border border-[color:var(--ai-border-muted)]",
        levelBorders[level],
        className,
      )}
    >
      <span className="text-[color:var(--ai-text-strong)]">{icon}</span>
      <div className="space-y-1">
        <p className="ai-meta-text">{timestamp}</p>
        <p className="text-sm font-semibold text-[color:var(--ai-text-strong)]">{message}</p>
      </div>
    </li>
  );
}
