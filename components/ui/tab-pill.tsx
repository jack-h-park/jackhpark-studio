import * as React from "react";

import type { ButtonProps } from "./button";
import { cn } from "./utils";

export type TabPillProps = ButtonProps & {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  active?: boolean;
};

export function TabPill({
  title,
  subtitle,
  icon,
  active = false,
  variant: _variant,
  size: _size,
  className,
  type = "button",
  ...props
}: TabPillProps) {
  const isActive = Boolean(active);
  const isDisabled = Boolean(props.disabled);
  const tabIndex = isActive && !isDisabled ? 0 : -1;

  return (
    <button
      type={type}
      role="tab"
      tabIndex={tabIndex}
      aria-selected={isActive}
      className={cn(
        "relative flex flex-1 items-center justify-center gap-2 rounded-t-[var(--ai-radius-pill)] px-4 py-2 text-sm font-medium transition focus-ring disabled:pointer-events-none disabled:opacity-50",
        "ai-selectable ai-selectable--hoverable",
        isActive && "ai-selectable--active",
        className,
      )}
      {...props}
    >
      <span className="flex items-center gap-2">
        {icon ? (
          <span className="flex items-center justify-center w-4 h-4">
            {icon}
          </span>
        ) : null}
        <span className="flex flex-col items-start leading-none">
          <span className="font-semibold">{title}</span>
          {subtitle ? (
            <span className="text-xs opacity-80 uppercase tracking-widest">
              {subtitle}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

TabPill.displayName = "TabPill";
