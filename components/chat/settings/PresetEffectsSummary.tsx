"use client";

import { type ReactNode } from "react";

import { cn } from "@/components/ui/utils";

export type PresetEffectItem = {
  label: string;
  value: ReactNode;
};

export type PresetEffectsSummaryProps = {
  items: PresetEffectItem[];
  className?: string;
  actions?: ReactNode;
};

export function formatPresetDecimal(value: number, decimals = 2) {
  const fixed = value.toFixed(decimals);
  const trimmed = fixed.replace(/\.?0+$/, "");
  return trimmed.includes(".") ? trimmed : `${trimmed}.0`;
}

export function formatPresetNumber(value: number) {
  return value.toLocaleString();
}

export function PresetEffectsSummary({
  items,
  className,
  actions,
}: PresetEffectsSummaryProps) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-[color:var(--ai-border-muted)] bg-[color:var(--ai-surface-muted)] p-3 text-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Preset Effects (Managed by Preset)
          </p>
          <p className="mt-1 text-[10px] text-[color:var(--ai-text-muted)]">
            These values are enforced by the selected preset.
          </p>
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-[color:var(--ai-text-default)]">
        {items.map((item) => (
          <li key={item.label}>
            <span className="font-semibold text-[color:var(--ai-text-default)]">
              {item.label}:
            </span>{" "}
            <span className="text-[color:var(--ai-text-muted)]">
              {item.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
