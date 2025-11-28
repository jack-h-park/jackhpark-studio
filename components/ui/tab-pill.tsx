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
        "relative flex flex-1 items-center justify-center gap-2 rounded-t-[var(--ai-radius-pill)] border px-4 py-2 text-sm font-medium transition-all duration-200 ease-linear focus-ring disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-[var(--ai-accent-bg)] text-[var(--ai-text-strong)] border-ai border-b-transparent shadow-[0_16px_32px_rgba(15,23,42,0.08)] z-10 mb-[-1px]"
          : "bg-[hsl(var(--ai-bg-muted))] text-[var(--ai-text-muted)] border-ai hover:bg-[hsl(var(--ai-bg))] hover:text-[var(--ai-text-strong)]",
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
