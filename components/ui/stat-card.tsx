import * as React from "react";

import { Card, CardContent } from "./card";
import { cn } from "./utils";

export type StatCardTone = "success" | "warning" | "error" | "info" | "muted";

export type StatCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: {
    text: string;
    tone?: StatCardTone;
  };
  meta?: React.ReactNode;
  className?: string;
};

const toneClasses: Record<StatCardTone, string> = {
  success: "ai-text-success",
  warning: "ai-text-warning",
  error: "ai-text-error",
  info: "ai-text-info",
  muted: "ai-text-soft",
};

export function StatCard({
  label,
  value,
  delta,
  meta,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("ai-stat-card", className)}>
      <CardContent className="ai-stat-card__content">
        <p className="ai-stat-card__label">{label}</p>
        <div className="ai-stat-card__value">{value}</div>
        {delta ? (
          <p className={cn("ai-stat-card__delta", toneClasses[delta.tone ?? "muted"])}>
            {delta.text}
          </p>
        ) : null}
        {meta ? (
          <div className="ai-stat-card__meta">
            {meta}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
StatCard.displayName = "StatCard";
