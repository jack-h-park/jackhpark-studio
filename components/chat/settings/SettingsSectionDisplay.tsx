"use client";

import { FiMonitor } from "@react-icons/all-files/fi/FiMonitor";

import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { AllowlistTile } from "@/components/ui/allowlist-tile";

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
        <AllowlistTile
          id="telemetry-badges"
          label="Telemetry badges"
          description="Show engine, guardrail, and enhancement insights."
          selected={showTelemetry}
          onClick={() => setShowTelemetry(!showTelemetry)}
        />

        <div className="pl-12">
          <AllowlistTile
            id="telemetry-auto-expand"
            label="Auto expand telemetry on toggle"
            //subtitle="Depends on telemetry badges"
            description="Expand the telemetry drawer whenever telemetry badges are enabled."
            selected={telemetryAutoExpand}
            onClick={() => setTelemetryAutoExpand(!telemetryAutoExpand)}
            disabled={!showTelemetry}
            className="ai-allowlist-tile--dependent"
          />
        </div>

        <AllowlistTile
          id="citations"
          label="Citations"
          description="Show every retrieved source (may include tiny text excerpts)."
          selected={showCitations}
          onClick={() => setShowCitations(!showCitations)}
        />
      </SectionContent>
    </Section>
  );
}
