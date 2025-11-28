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
  info: "bg-[hsl(var(--ai-bg-muted))] border-[hsl(var(--ai-border))]",
  warn: "bg-[var(--ai-warning-muted)] border-[var(--ai-warning)]",
  error: "bg-[var(--ai-error-muted)] border-[var(--ai-error)]",
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
        "flex items-start gap-3 p-3 rounded-[var(--ai-radius-lg)] border text-sm",
        levelClasses[level],
        className,
      )}
    >
      <span className="flex-shrink-0 mt-0.5" aria-hidden="true">
        {icon}
      </span>
      <div className="space-y-1">
        <p className="text-xs text-[var(--ai-text-muted)] font-mono">
          {timestamp}
        </p>
        <p className="text-[var(--ai-text)] leading-relaxed">{message}</p>
      </div>
    </li>
  );
}
