import * as React from "react";

import { cn } from "./utils";

/**
 * Tone names follow the shared guidelines (§5): neutral, info, success,
 * warning, danger. `muted` and `error` are the older names and stay as
 * aliases so existing call sites keep working.
 */
export type StatusPillTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";
export type StatusPillVariant = StatusPillTone | "muted" | "error";

const TONE_ALIASES: Record<StatusPillVariant, StatusPillTone> = {
  neutral: "neutral",
  muted: "neutral",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
  error: "danger",
};

export function resolveStatusPillTone(
  variant: StatusPillVariant,
): StatusPillTone {
  return TONE_ALIASES[variant];
}

const toneStyles: Record<StatusPillTone, string> = {
  success:
    "bg-[var(--ai-success-muted)] border-[var(--ai-success)] text-[var(--ai-success)]",
  // The warning fill is too light for text (3.72:1 on white); the text token is not.
  warning:
    "bg-[var(--ai-warning-muted)] border-[var(--ai-warning)] text-[var(--ai-warning-text)]",
  danger:
    "bg-[var(--ai-error-muted)] border-[var(--ai-error)] text-[var(--ai-error)]",
  info: "bg-[var(--ai-info-muted)] border-[var(--ai-info)] text-[var(--ai-info)]",
  neutral:
    "bg-[color:var(--ai-pill-bg)] border-[color:var(--ai-border-strong)] text-[color:var(--ai-text-strong)]",
};

export type StatusPillProps = {
  variant?: StatusPillVariant;
  className?: string;
  children: React.ReactNode;
};

export function StatusPill({
  variant = "neutral",
  className,
  children,
}: StatusPillProps) {
  const tone = resolveStatusPillTone(variant);
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex items-center justify-center px-[0.65rem] py-[0.2rem] rounded-[var(--ai-radius-pill)] border border-transparent bg-[var(--ai-border-soft)] ai-label-overline ai-label-overline--small",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
StatusPill.displayName = "StatusPill";
