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
  success: "text-[var(--ai-success)]",
  warning: "text-[var(--ai-warning)]",
  error: "text-[var(--ai-error)]",
  info: "text-[var(--ai-accent)]",
  muted: "text-[var(--ai-text-soft)]",
};

export function StatCard({
  label,
  value,
  delta,
  meta,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("h-full", className)}>
      <CardContent className="ai-stat">
        <p className="ai-stat__label">{label}</p>
        <div className="ai-stat__value">{value}</div>
        {delta ? (
          <p
            className={cn("ai-stat__delta", toneClasses[delta.tone ?? "muted"])}
          >
            {delta.text}
          </p>
        ) : null}
        {meta ? (
          <div className="mt-auto pt-4 border-t border-[hsl(var(--ai-border))] text-xs text-[var(--ai-text-muted)]">
            {meta}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
StatCard.displayName = "StatCard";
