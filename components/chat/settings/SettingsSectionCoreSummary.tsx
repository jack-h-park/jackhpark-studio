"use client";

import { FiCommand } from "@react-icons/all-files/fi/FiCommand";

import {
  Section,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";

type Props = {
  summary: string;
};

export function SettingsSectionCoreSummary({ summary }: Props) {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle as="p" icon={<FiCommand aria-hidden="true" />}>
          Core System Behavior
        </SectionTitle>
      </SectionHeader>
      <SectionDescription>{summary}</SectionDescription>
    </Section>
  );
}
