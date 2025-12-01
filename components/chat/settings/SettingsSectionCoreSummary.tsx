"use client";

import { FiCommand } from "@react-icons/all-files/fi/FiCommand";

import { HeadingWithIcon } from "@/components/ui/heading-with-icon";

type Props = {
  summary: string;
};

export function SettingsSectionCoreSummary({ summary }: Props) {
  return (
    <section className="ai-setting-section">
      <HeadingWithIcon
        as="p"
        icon={<FiCommand aria-hidden="true" />}
        className="ai-setting-section-header flex items-center justify-between gap-3"
      >
        Core System Behavior
      </HeadingWithIcon>
      <p className="ai-setting-section-description">{summary}</p>
    </section>
  );
}
