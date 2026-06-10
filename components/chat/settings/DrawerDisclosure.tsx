"use client";

import type * as React from "react";
import { FiChevronDown } from "@react-icons/all-files/fi/FiChevronDown";

import { cn } from "@/components/ui/utils";

import styles from "./ChatAdvancedSettingsDrawer.module.css";

type Props = {
  title: React.ReactNode;
  /** Secondary line under the title shown while collapsed. */
  hint?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Native details/summary disclosure for the chat settings drawer.
 * Used for progressive reveal: casual visitors see the summary row only;
 * the technical content stays one click away.
 */
export function DrawerDisclosure({
  title,
  hint,
  defaultOpen,
  className,
  children,
}: Props) {
  return (
    <details className={cn(styles.disclosure, className)} open={defaultOpen}>
      <summary className={styles.disclosureSummary}>
        <span className="flex flex-col gap-0.5">
          <span>{title}</span>
          {hint ? <span className={styles.disclosureHint}>{hint}</span> : null}
        </span>
        <FiChevronDown
          className={styles.disclosureChevron}
          size={16}
          aria-hidden="true"
        />
      </summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}
