import * as React from "react";

import { Card, CardContent } from "./card";
import { cn } from "./utils";

export type TipCalloutProps = {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function TipCallout({ title = "Tip", children, className }: TipCalloutProps) {
  return (
    <Card className={cn("ai-tip-callout", className)}>
      <CardContent className="ai-tip-callout__content">
        {title ? (
          <p className="ai-tip-callout__title">
            {title}
          </p>
        ) : null}
        <div className="ai-tip-callout__body">{children}</div>
      </CardContent>
    </Card>
  );
}
