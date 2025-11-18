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
};

export function ScopeTile({
  name,
  value,
  label,
  description,
  checked,
  disabled,
  onChange,
}: ScopeTileProps) {
  return (
    <label
      className={cn(
        "relative block w-full cursor-pointer rounded-2xl border px-4 py-3 transition focus-within:outline focus-within:outline-2 focus-within:outline-[color:var(--ai-accent)]",
        checked
          ? "border-[color:var(--ai-accent)] bg-[color:var(--ai-accent-bg)] shadow-sm"
          : "border-[color:var(--ai-border)] bg-[color:var(--ai-bg)]",
        disabled && "pointer-events-none opacity-60",
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
      <span className="text-sm font-semibold text-[color:var(--ai-text-strong)]">
        {label}
      </span>
      <span className="block text-xs text-[color:var(--ai-text-muted)]">
        {description}
      </span>
    </label>
  );
}
ScopeTile.displayName = "ScopeTile";
