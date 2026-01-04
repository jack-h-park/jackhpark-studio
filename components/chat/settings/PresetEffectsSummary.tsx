import { type ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
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
    <div className={cn("ai-card flex flex-col p-4 gap-4", className)}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--ai-text)]">
              Preset Effects
            </h3>
            <StatusPill variant="muted">Managed by Preset</StatusPill>
          </div>
          {actions && <div>{actions}</div>}
        </div>
        <p className="text-xs text-[var(--ai-text-muted)]">
          These values are enforced by the selected preset.
        </p>
      </div>

      <ul className="flex flex-col gap-2 pt-2 border-t border-[var(--ai-border-soft)]">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex justify-between items-start text-sm"
          >
            <span className="font-medium text-[var(--ai-text)] mr-4 shrink-0">
              {item.label}
            </span>
            <span className="text-[var(--ai-text-muted)] text-right">
              {item.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
