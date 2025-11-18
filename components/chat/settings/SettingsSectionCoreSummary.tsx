"use client";

import { FiCommand } from "@react-icons/all-files/fi/FiCommand";

import { HeadingWithIcon } from "@/components/ui/heading-with-icon";

type Props = {
  summary: string;
};

export function SettingsSectionCoreSummary({ summary }: Props) {
  return (
    <section className="ai-panel ai-settings-section">
      <HeadingWithIcon
        as="p"
        icon={<FiCommand aria-hidden="true" />}
        className="ai-settings-section__title"
      >
        Core System Behavior
      </HeadingWithIcon>
      <p className="ai-section-caption">{summary}</p>
    </section>
  );
}
