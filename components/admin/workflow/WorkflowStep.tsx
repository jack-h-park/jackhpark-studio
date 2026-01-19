import type { ReactNode } from "react";

import { cn } from "@/components/ui/utils";

import styles from "./WorkflowStep.module.css";

type WorkflowStepSeam = "none" | "top" | "bottom" | "both";

export type WorkflowStepProps = {
  /**
   * Optional eyebrow text rendered above the title.
   */
  eyebrow?: ReactNode;
  /**
   * Step title; rendered with default styling but can be JSX if more control is needed.
   */
  title: ReactNode;
  /**
   * Optional hint text placed below the title row.
   */
  hint?: ReactNode;
  /**
   * Optional right-aligned slot for controls that belong to the step header.
   */
  rightSlot?: ReactNode;
  /**
   * Divider seam ownership for top / bottom borders.
   */
  seam?: WorkflowStepSeam;
  titleId?: string;
  hintId?: string;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
};

export function WorkflowStep({
  eyebrow,
  title,
  hint,
  rightSlot,
  seam = "none",
  titleId,
  hintId,
  className,
  bodyClassName,
  children,
}: WorkflowStepProps) {
  const seamClass =
    seam === "both"
      ? cn(styles.seamTop, styles.seamBottom)
      : seam === "top"
      ? styles.seamTop
      : seam === "bottom"
      ? styles.seamBottom
      : undefined;

  return (
    <div className={cn(styles.root, seamClass, className)}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <div className={styles.title} id={titleId}>
            {title}
          </div>
          {hint ? (
            <div className={styles.hint} id={hintId}>
              {hint}
            </div>
          ) : null}
        </div>
        {rightSlot ? <div className={styles.rightSlot}>{rightSlot}</div> : null}
      </div>
      {children ? (
        <div className={cn(styles.body, bodyClassName)}>
          <div className={styles.bodyInner}>{children}</div>
        </div>
      ) : null}
    </div>
  );
}
