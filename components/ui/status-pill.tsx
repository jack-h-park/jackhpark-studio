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
  muted: "border-[hsl(var(--ai-border))] text-[var(--ai-text-muted)]",
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
        "inline-flex items-center justify-center px-[0.65rem] py-[0.2rem] rounded-[var(--ai-radius-pill)] text-[0.65rem] font-semibold uppercase tracking-[0.25em] border border-transparent bg-[var(--ai-border-soft)] text-[var(--ai-text-muted)]",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
StatusPill.displayName = "StatusPill";
