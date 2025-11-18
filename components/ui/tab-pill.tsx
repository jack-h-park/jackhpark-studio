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
        "ai-tab-pill",
        isActive ? "ai-tab-pill--active" : "ai-tab-pill--inactive",
        className,
      )}
      {...props}
    >
      <span className="ai-tab-pill__content">
        {icon ? <span className="ai-tab-pill__icon">{icon}</span> : null}
        <span className="ai-tab-pill__label-group">
          <span className="ai-tab-pill__title">{title}</span>
          {subtitle ? (
            <span className="ai-tab-pill__subtitle">{subtitle}</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

TabPill.displayName = "TabPill";
