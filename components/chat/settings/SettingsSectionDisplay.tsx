"use client";

import { FiMonitor } from "@react-icons/all-files/fi/FiMonitor";

import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { DependentGroup, SwitchField } from "@/components/ui/field";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";

export function SettingsSectionDisplay() {
  const {
    showTelemetry,
    telemetryAutoExpand,
    showCitations,
    setShowTelemetry,
    setTelemetryAutoExpand,
    setShowCitations,
  } = useChatDisplaySettings();

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
          onCheckedChange={(checked) => {
            setShowTelemetry(checked);
            if (!checked) {
              setTelemetryAutoExpand(false);
            }
          }}
          variant="plain"
        />

        <DependentGroup isEnabled={showTelemetry}>
          <SwitchField
            id="telemetry-auto-expand"
            label="Auto expand telemetry on toggle"
            //subtitle="Depends on telemetry badges"
            description="Expand the telemetry drawer whenever telemetry badges are enabled."
            checked={telemetryAutoExpand}
            onCheckedChange={setTelemetryAutoExpand}
            variant="plain"
          />
        </DependentGroup>

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
