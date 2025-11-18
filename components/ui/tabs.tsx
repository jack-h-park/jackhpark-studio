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
      className={cn(
        "flex w-full items-stretch rounded-2xl border border-[color:var(--ai-border)] bg-[color:var(--ai-bg-muted)] shadow-inner",
        className,
      )}
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
              "flex-1 min-w-[10rem] flex-col gap-1 whitespace-nowrap border-0 bg-transparent px-4 py-3 text-left font-semibold text-[color:var(--ai-text-strong)] transition first:border-r-0 last:border-r-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ai-accent)] focus-visible:outline-offset-2",
              variantPadding[variant],
              isActive
                ? "border-b-2 border-b-[color:var(--ai-accent)] bg-[color:var(--ai-bg)] text-[color:var(--ai-accent-strong)] shadow-[0_10px_20px_rgba(15,15,15,0.05)]"
                : "border-b-2 border-b-transparent hover:bg-[color:var(--ai-bg)]",
              isDisabled && "cursor-not-allowed opacity-80",
            )}
          >
            <span className="inline-flex items-center gap-2">
              {tab.icon ? (
                <span className="flex h-4 w-4 items-center justify-center text-[color:var(--ai-text-muted)]">
                  {tab.icon}
                </span>
              ) : null}
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span>{tab.label}</span>
                {tab.subtitle ? (
                  <span className="text-xs font-normal text-[color:var(--ai-text-muted)]">
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
