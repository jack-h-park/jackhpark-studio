import * as React from "react";

import { cn } from "./utils";

export type ScopeTileValue = "partial" | "full";

export type ScopeTileProps = {
  name: string;
  value: ScopeTileValue;
  label: React.ReactNode;
  description: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: ScopeTileValue) => void;
  className?: string;
};

export function ScopeTile({
  name,
  value,
  label,
  description,
  checked,
  disabled,
  onChange,
  className,
}: ScopeTileProps) {
  return (
    <label
      className={cn(
        "ai-control-tile",
        checked ? "ai-control-tile--active" : "ai-control-tile--inactive",
        disabled && "ai-control-tile--disabled",
        className,
      )}
    >
      <input
        className="sr-only"
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <span className="ai-control-tile__label">
        {label}
      </span>
      <span className="ai-control-tile__description">
        {description}
      </span>
    </label>
  );
}
ScopeTile.displayName = "ScopeTile";
