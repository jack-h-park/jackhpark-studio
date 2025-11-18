import * as React from "react";

import { cn } from "./utils";

export type ProgressGroupProps = {
  label: React.ReactNode;
  value: number;
  meta?: React.ReactNode;
  min?: number;
  max?: number;
  footer?: React.ReactNode;
  className?: string;
};

export function ProgressGroup({
  label,
  value,
  min = 0,
  max = 100,
  meta,
  footer,
  className,
}: ProgressGroupProps) {
  const clampedValue = Math.min(Math.max(value, min), max);
  const percentage =
    max > min
      ? ((clampedValue - min) / (max - min)) * 100
      : max === min
      ? 100
      : 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-[color:var(--ai-text-strong)]">
          {label}
        </p>
        {meta ? (
          <span className="text-xs text-[color:var(--ai-text-muted)]">{meta}</span>
        ) : null}
      </div>
      <div className="h-2 rounded-full bg-[color:var(--ai-border-muted)] overflow-hidden">
        <span
          className="block h-full rounded-full bg-[color:var(--ai-accent-strong)] transition-[width] duration-200 ease"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {footer ? <div className="space-y-2">{footer}</div> : null}
    </div>
  );
}
