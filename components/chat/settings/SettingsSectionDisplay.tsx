"use client";

import { FiMonitor } from "@react-icons/all-files/fi/FiMonitor";

import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { SwitchField } from "@/components/ui/field";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";

export function SettingsSectionDisplay() {
  const { showTelemetry, showCitations, setShowTelemetry, setShowCitations } =
    useChatDisplaySettings();

  return (
    <Section>
      <SectionHeader>
        <SectionTitle as="p" icon={<FiMonitor aria-hidden="true" />}>
          Diagnostics Display
        </SectionTitle>
      </SectionHeader>
      <SectionContent className="grid gap-3">
        <SwitchField
          id="telemetry-badges"
          label="Telemetry badges"
          description="Show engine, guardrail, and enhancement insights."
          checked={showTelemetry}
          onCheckedChange={setShowTelemetry}
          variant="plain"
        />

        <SwitchField
          id="citations"
          label="Citations"
          description="Show every retrieved source (may include tiny text excerpts)."
          checked={showCitations}
          onCheckedChange={setShowCitations}
          variant="plain"
        />
      </SectionContent>
    </Section>
  );
}
