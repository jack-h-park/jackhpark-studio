import * as React from "react";

import { cn } from "./utils";

export type StatusPillVariant =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "muted";

const variantStyles: Record<StatusPillVariant, string> = {
  success:
    "bg-[var(--ai-success-muted)] border-[var(--ai-success)] text-[var(--ai-success)]",
  warning:
    "bg-[var(--ai-warning-muted)] border-[var(--ai-warning)] text-[var(--ai-warning)]",
  error:
    "bg-[var(--ai-error-muted)] border-[var(--ai-error)] text-[var(--ai-error)]",
  info: "bg-[var(--ai-accent-bg)] border-[var(--ai-accent)] text-[var(--ai-accent-strong)]",
  muted:
    "bg-[color:var(--ai-pill-bg)] border-[color:var(--ai-border-strong)] text-[color:var(--ai-text-strong)]",
};

export type StatusPillProps = {
  variant?: StatusPillVariant;
  className?: string;
  children: React.ReactNode;
};

export function StatusPill({
  variant = "muted",
  className,
  children,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center px-[0.65rem] py-[0.2rem] rounded-[var(--ai-radius-pill)] border border-transparent bg-[var(--ai-border-soft)] ai-label-overline ai-label-overline--small",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
StatusPill.displayName = "StatusPill";
