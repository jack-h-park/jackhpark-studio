import * as React from "react";

import { cn } from "@/components/ui/utils";

import styles from "./IngestionSourceToggle.module.css";

export type SourceModeToggleValue = "notion_page" | "url";

export type IngestionSourceToggleProps = {
  value: SourceModeToggleValue;
  onChange: (value: SourceModeToggleValue) => void;
  disabled?: boolean;
  className?: string;
  size?: "md" | "sm";
};

export function IngestionSourceToggle({
  value,
  onChange,
  disabled = false,
  className,
  size = "md",
}: IngestionSourceToggleProps) {
  const notionSelected = value === "notion_page";
  const urlSelected = value === "url";

  const handleClick = (mode: SourceModeToggleValue) => {
    if (disabled || mode === value) {
      return;
    }

    onChange(mode);
  };

  return (
    <div
      role="group"
      aria-label="Source mode"
      className={cn(styles.root, styles[size], className)}
    >
      <button
        type="button"
        aria-pressed={notionSelected}
        aria-label="Notion"
        className={cn(styles.segment, "ai-selectable ai-selectable--hoverable focus-ring")}
        data-selected={notionSelected ? "true" : undefined}
        data-disabled={disabled ? "true" : undefined}
        disabled={disabled}
        onClick={() => handleClick("notion_page")}
      >
        Notion
      </button>
      <button
        type="button"
        aria-pressed={urlSelected}
        aria-label="URL"
        className={cn(styles.segment, "ai-selectable ai-selectable--hoverable focus-ring")}
        data-selected={urlSelected ? "true" : undefined}
        data-disabled={disabled ? "true" : undefined}
        disabled={disabled}
        onClick={() => handleClick("url")}
      >
        URL
      </button>
    </div>
  );
}

IngestionSourceToggle.displayName = "IngestionSourceToggle";
