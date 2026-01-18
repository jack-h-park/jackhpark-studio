import type { TooltipContentProps } from "@radix-ui/react-tooltip";
import * as React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type Props = {
  text: string;
  children: React.ReactNode;
  side?: TooltipContentProps["side"];
  sideOffset?: TooltipContentProps["sideOffset"];
  ariaLabel?: string;
};

export function ImpactTooltip({
  text,
  children,
  side,
  sideOffset,
  ariaLabel,
}: Props) {
  const label = ariaLabel ?? "More info";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--ai-border-strong)]"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={sideOffset}>
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
