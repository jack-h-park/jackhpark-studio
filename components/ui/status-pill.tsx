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
    "bg-[color:var(--ai-success-muted)] border border-[color:var(--ai-success)] text-[color:var(--ai-success)]",
  warning:
    "bg-[color:var(--ai-warning-muted)] border border-[color:var(--ai-warning)] text-[color:var(--ai-warning)]",
  error: "bg-[color:var(--ai-error-muted)] border border-[color:var(--ai-error)] text-[color:var(--ai-error)]",
  info: "bg-[color:var(--ai-accent-bg)] border border-[color:var(--ai-accent)] text-[color:var(--ai-accent-strong)]",
  muted: "bg-[color:var(--ai-border-soft)] border border-[color:var(--ai-border)] text-[color:var(--ai-text-muted)]",
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
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.25em] shadow-sm",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
StatusPill.displayName = "StatusPill";
