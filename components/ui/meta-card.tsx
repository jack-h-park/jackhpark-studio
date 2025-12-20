import * as React from "react";

import { cn } from "./utils";

export interface MetaCardItem {
  label: string;
  value: React.ReactNode;
  isWarning?: boolean;
  tooltip?: string;
  className?: string;
}

export interface MetaCardProps {
  title: string;
  items: MetaCardItem[];
  variant?: "default" | "runtime" | "guardrail" | "enhancements";
  className?: string;
  footer?: React.ReactNode;
}

/**
 * MetaCard is a diagnostic UI primitive used to display structured metadata
 * (e.g., LLM engine details, RAG guardrails, telemetry).
 */
export function MetaCard({
  title,
  items,
  variant = "default",
  className,
  footer,
}: MetaCardProps) {
  const variantClass = variant !== "default" ? `ai-meta-card--${variant}` : "";

  return (
    <div className={cn("ai-meta-card", variantClass, className)}>
      <div className="ai-meta-card-heading">{title}</div>
      <div className="ai-meta-card-grid">
        {items.map((item, idx) => (
          <div key={idx} className={cn("ai-meta-card-block", item.className)}>
            <div className="ai-meta-card-label">{item.label}</div>
            <div
              className={cn(
                "ai-meta-card-value",
                item.isWarning && "ai-meta-card-value--warning",
              )}
              data-tooltip={item.tooltip}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
      {footer && <div className="ai-meta-card-footer">{footer}</div>}
    </div>
  );
}

export function MetaChip({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "warning";
  className?: string;
}) {
  const variantClass = variant === "warning" ? "ai-meta-chip--warning" : "";
  return (
    <span className={cn("ai-meta-chip", variantClass, className)}>
      {children}
    </span>
  );
}
