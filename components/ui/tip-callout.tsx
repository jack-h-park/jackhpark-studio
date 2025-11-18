import * as React from "react";

import { Card } from "./card";
import { cn } from "./utils";

export type TipCalloutProps = {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function TipCallout({ title = "Tip", children, className }: TipCalloutProps) {
  return (
    <Card
      className={cn(
        "border-[color:var(--ai-accent-soft)] bg-[color:var(--ai-accent-bg)] text-[color:var(--ai-text-muted)] shadow-none",
        className,
      )}
    >
      <div className="space-y-2 px-4 py-3">
        {title ? (
          <p className="text-[0.7rem] uppercase tracking-[0.25em] font-semibold text-[color:var(--ai-accent-strong)]">
            {title}
          </p>
        ) : null}
        <div className="text-sm text-[color:var(--ai-text-muted)]">{children}</div>
      </div>
    </Card>
  );
}
