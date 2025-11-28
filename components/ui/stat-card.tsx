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
      <CardContent className="flex flex-col gap-1 h-full">
        <p className="m-0 text-xs uppercase tracking-[0.3em] font-semibold">
          {label}
        </p>
        <div className="text-2xl font-bold text-[var(--ai-text)] tracking-tight">
          {value}
        </div>
        {delta ? (
          <p
            className={cn(
              "text-sm font-medium flex items-center gap-1",
              toneClasses[delta.tone ?? "muted"],
            )}
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
