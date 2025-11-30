"use client";

import { FiCommand } from "@react-icons/all-files/fi/FiCommand";

import { HeadingWithIcon } from "@/components/ui/heading-with-icon";

import styles from "./SettingsSection.module.css";

type Props = {
  summary: string;
};

export function SettingsSectionCoreSummary({ summary }: Props) {
  return (
    <section className={`ai-panel ${styles.section}`}>
      <HeadingWithIcon
        as="p"
        icon={<FiCommand aria-hidden="true" />}
        className={styles.title}
      >
        Core System Behavior
      </HeadingWithIcon>
      <p className={styles.description}>{summary}</p>
    </section>
  );
}
