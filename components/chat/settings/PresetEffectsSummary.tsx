import { type ReactNode } from "react";

import { cn } from "@/components/ui/utils";

import drawerStyles from "./ChatAdvancedSettingsDrawer.module.css";
import styles from "./PresetEffectsSummary.module.css";

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
    <div className={cn(className)}>
      <div
        className={cn(
          drawerStyles.drawerDivider,
          drawerStyles.drawerDividerSpacing,
        )}
      />
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-50">
          Preset Effects
        </span>
        {actions && <div className={styles.actionsSlot}>{actions}</div>}
      </div>
      <dl className={styles.effectsList}>
        {items.map((item) => (
          <div key={item.label} className={styles.effectRow}>
            <dt className={styles.effectLabel}>{item.label}</dt>
            <dd className={styles.effectValue}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
