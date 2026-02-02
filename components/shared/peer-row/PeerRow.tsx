import type { ReactNode } from "react";

import { cn } from "@/components/ui/utils";

import styles from "./PeerRow.module.css";

export type PeerRowProps = {
  /**
   * Optional heading for the row (e.g., small caps label).
   */
  label?: ReactNode;
  /**
   * Optional hint text underneath the label.
   */
  hint?: ReactNode;
  /**
   * Optional ID for the label paragraph so it can be referenced.
   */
  labelId?: string;
  /**
   * Optional ID for the hint paragraph so it can be referenced.
   */
  hintId?: string;
  /**
   * Optional data attribute for rail debugging.
   */
  dataRailId?: string;
  className?: string;
  children: ReactNode;
};

export function PeerRow({
  label,
  hint,
  className,
  children,
  labelId,
  hintId,
  dataRailId,
}: PeerRowProps) {
  return (
    <div className={cn(styles.root, className)} data-rail={dataRailId}>
      {label || hint ? (
        <div className={styles.header}>
          {label ? (
            <p className={styles.label} id={labelId}>
              {label}
            </p>
          ) : null}
          {hint ? (
            <p className={styles.hint} id={hintId}>
              {hint}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
