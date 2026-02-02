import * as React from "react";

import styles from "./dashboard-stat-tile.module.css";
import insetPanelStyles from "./inset-panel.module.css";
import { cn } from "./utils";

export type DashboardStatTone =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "muted";

export type DashboardStatTileProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: {
    text: string;
    tone?: DashboardStatTone;
  };
  className?: string;
  headerAction?: React.ReactNode;
  valueTone?: "strong" | "muted";
  valueClassName?: string;
  deltaClassName?: string;
  sectionHint?: string;
};

const toneClasses: Record<DashboardStatTone, string> = {
  success: "text-[var(--ai-success)]",
  warning: "text-[var(--ai-warning)]",
  error: "text-[var(--ai-error)]",
  info: "text-[var(--ai-accent)]",
  muted: "text-[var(--ai-text-soft)]",
};

export function DashboardStatTile({
  label,
  value,
  delta,
  className,
  headerAction,
  valueTone = "strong",
  valueClassName,
  deltaClassName,
  sectionHint,
}: DashboardStatTileProps): React.ReactElement {
  const valueClasses = cn(
    "ai-stat__value",
    styles.dashboardStatTileValue,
    valueTone === "muted"
      ? styles.dashboardStatTileValueMuted
      : styles.dashboardStatTileValueStrong,
    valueClassName,
  );
  const labelRef = React.useRef<HTMLParagraphElement | null>(null);

  React.useEffect(() => {
    if (process.env.NODE_ENV === "development" && labelRef.current) {
      const computed = getComputedStyle(labelRef.current);
      console.debug(
        "[DashboardStatTile]",
        {
          sectionHint,
          labelText: labelRef.current.textContent,
          labelClassName: labelRef.current.className,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          letterSpacing: computed.letterSpacing,
          color: computed.color,
        },
        "label stats",
      );
    }
  }, [sectionHint]);

  return (
    <div
      className={cn(
        insetPanelStyles.insetPanel,
        styles.dashboardStatTile,
        className,
      )}
    >
      <div className="ai-stat">
        <div className={styles.dashboardStatTileHeader}>
          <p
            className={cn("ai-stat__label", styles.dashboardStatTileLabel)}
            ref={labelRef}
          >
            {label}
          </p>
          {headerAction ? (
            <span className={styles.dashboardStatTileHeaderAction}>
              {headerAction}
            </span>
          ) : null}
        </div>
        <div className={valueClasses}>{value}</div>
        {delta ? (
          <p
            className={cn(
              "ai-stat__delta",
              toneClasses[delta.tone ?? "muted"],
              deltaClassName,
            )}
          >
            {delta.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
