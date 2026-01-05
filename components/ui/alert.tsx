import * as React from "react";

import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiInfo } from "@react-icons/all-files/fi/FiInfo";
import { FiX } from "@react-icons/all-files/fi/FiX";

import { Button } from "./button";
import { cn } from "./utils";

export type InlineAlertSeverity = "info" | "warning";

type SeverityStyles = {
  container: string;
  iconColor: string;
};

const severityStyles: Record<InlineAlertSeverity, SeverityStyles> = {
  info: {
    container:
      "border border-[var(--ai-border-muted)] bg-[hsl(var(--ai-bg))] text-[var(--ai-text-default)]",
    iconColor: "text-[var(--ai-text-muted)]",
  },
  warning: {
    container:
      "border border-[var(--ai-warning)] bg-[color-mix(in srgb,var(--ai-warning) 80%,var(--ai-bg))] text-[var(--ai-text-strong)]",
    iconColor: "text-[var(--ai-warning)]",
  },
};

export type InlineAlertProps = {
  severity?: InlineAlertSeverity;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  titleClassName?: string;
  bodyClassName?: string;
  icon?: React.ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  dismissButtonClassName?: string;
};

export function InlineAlert({
  severity = "info",
  title,
  children,
  className,
  titleClassName,
  bodyClassName,
  icon,
  onDismiss,
  dismissLabel,
  dismissButtonClassName,
}: InlineAlertProps) {
  const styles = severityStyles[severity];
  const iconNode =
    icon ??
    (severity === "warning" ? (
      <FiAlertTriangle
        className={cn("h-4 w-4", styles.iconColor)}
        aria-hidden="true"
      />
    ) : (
      <FiInfo
        className={cn("h-4 w-4", styles.iconColor)}
        aria-hidden="true"
      />
    ));

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 text-sm px-3 py-3 rounded-[var(--ai-radius-lg)] shadow-ai",
        styles.container,
        className,
      )}
    >
      <span className="flex-shrink-0 mt-0.5">{iconNode}</span>
      <div className="flex-1 space-y-0.5">
        {title ? (
          <p
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider",
              titleClassName,
            )}
          >
            {title}
          </p>
        ) : null}
        <div className={cn("leading-tight", bodyClassName)}>{children}</div>
      </div>
      {onDismiss ? (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "-mt-0.5 h-5 w-5 text-[var(--ai-text-muted)] hover:bg-[color:var(--ai-bg-surface-hover)] hover:text-[var(--ai-text-default)]",
            dismissButtonClassName,
          )}
          onClick={onDismiss}
          aria-label={dismissLabel ?? "Dismiss alert"}
        >
          <FiX className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
