import { type ReactNode } from "react";

import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/components/ui/utils";
import styles from "./PresetEffectsSummary.module.css";
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";
import { FiZap } from "@react-icons/all-files/fi/FiZap";

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
    <Section className={cn("gap-2", className)}>
      <SectionHeader>
        <SectionTitle
          as="div"
          icon={<FiZap aria-hidden="true" />}
          className="flex-wrap gap-2"
        >
          <span>Preset Effects</span>
        </SectionTitle>
        {actions && <div className={styles.actionsSlot}>{actions}</div>}
      </SectionHeader>

      <SectionContent className="flex flex-col gap-2">
        <SectionDescription>
          These values are enforced by the selected preset.
        </SectionDescription>
        <dl
          className={cn(
            "pt-2 border-t border-[var(--ai-divider)]",
            styles.effectsList,
          )}
        >
          {items.map((item) => (
            <div key={item.label} className={styles.effectRow}>
              <dt className={styles.effectLabel}>{item.label}</dt>
              <dd className={styles.effectValue}>{item.value}</dd>
            </div>
          ))}
        </dl>
      </SectionContent>
    </Section>
  );
}
