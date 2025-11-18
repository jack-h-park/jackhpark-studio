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

const levelClasses: Record<ManualLogLevel, string> = {
  info: "ai-manual-log-entry--info",
  warn: "ai-manual-log-entry--warn",
  error: "ai-manual-log-entry--error",
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
        "ai-manual-log-entry",
        levelClasses[level],
        className,
      )}
    >
      <span className="ai-manual-log-entry__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="space-y-1">
        <p className="ai-manual-log-entry__timestamp">{timestamp}</p>
        <p className="ai-manual-log-entry__message">{message}</p>
      </div>
    </li>
  );
}
