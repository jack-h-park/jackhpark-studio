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
  success: "text-[color:var(--ai-success)]",
  warning: "text-[color:var(--ai-warning)]",
  error: "text-[color:var(--ai-error)]",
  info: "text-[color:var(--ai-accent)]",
  muted: "text-[color:var(--ai-text-soft)]",
};

export function StatCard({
  label,
  value,
  delta,
  meta,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("space-y-3", className)}>
      <CardContent className="space-y-6">
        <p className="text-[0.65rem] uppercase tracking-[0.3em] text-[color:var(--ai-text-muted)]">
          {label}
        </p>
        <div className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
          {value}
        </div>
        {delta ? (
          <p
            className={cn(
              "text-sm font-semibold",
              toneClasses[delta.tone ?? "muted"],
            )}
          >
            {delta.text}
          </p>
        ) : null}
        {meta ? (
          <div className="text-sm text-[color:var(--ai-text-muted)]">
            {meta}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
StatCard.displayName = "StatCard";
