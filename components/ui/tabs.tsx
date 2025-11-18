import type { ReactNode } from "react";

import { cn } from "./utils";

export type TabDefinition = {
  id: string;
  label: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
};

export type TabsProps = {
  tabs: TabDefinition[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  variant?: "compact" | "medium";
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

const variantPadding: Record<NonNullable<TabsProps["variant"]>, string> = {
  compact: "px-3 py-2 text-xs",
  medium: "px-4 py-3 text-sm",
};

export function Tabs({
  tabs,
  activeTabId,
  onTabChange,
  variant = "medium",
  className,
  ariaLabel,
  disabled,
}: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("ai-tabs-container ai-surface ai-tabs-surface", className)}
    >
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id;
        const isDisabled = Boolean(disabled || tab.disabled);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tabs-${tab.id}`}
            aria-controls={`tabpanel-${tab.id}`}
            aria-selected={isActive}
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled) {
                onTabChange(tab.id);
              }
            }}
            className={cn(
              "ai-tab-control",
              variantPadding[variant],
              isActive ? "ai-tab-control--active" : "ai-tab-control--inactive",
              isDisabled && "ai-tab-control--disabled",
            )}
          >
            <span className="inline-flex items-center gap-2">
              {tab.icon ? (
                <span className="flex h-4 w-4 items-center justify-center ai-text-muted">
                  {tab.icon}
                </span>
              ) : null}
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span>{tab.label}</span>
                {tab.subtitle ? (
                  <span className="text-xs font-normal ai-text-muted">
                    {tab.subtitle}
                  </span>
                ) : null}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type TabPanelProps = {
  tabId: string;
  activeTabId: string;
  children: ReactNode;
  className?: string;
};

export function TabPanel({
  tabId,
  activeTabId,
  children,
  className,
}: TabPanelProps) {
  const isActive = tabId === activeTabId;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tabId}`}
      aria-labelledby={`tabs-${tabId}`}
      hidden={!isActive}
      className={className}
    >
      {children}
    </div>
  );
}

Tabs.displayName = "Tabs";
TabPanel.displayName = "TabPanel";
