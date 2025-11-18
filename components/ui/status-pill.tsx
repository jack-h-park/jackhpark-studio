import * as React from "react";

import { cn } from "./utils";

export type StatusPillVariant =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "muted";

const variantStyles: Record<StatusPillVariant, string> = {
  success: "ai-status-pill--success",
  warning: "ai-status-pill--warning",
  error: "ai-status-pill--error",
  info: "ai-status-pill--info",
  muted: "ai-status-pill--muted",
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
        "ai-status-pill",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
StatusPill.displayName = "StatusPill";
