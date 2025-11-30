"use client";

import { FiMonitor } from "@react-icons/all-files/fi/FiMonitor";

import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { AllowlistTile } from "@/components/ui/allowlist-tile";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";

import styles from "./SettingsSection.module.css";

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
    <section className={`ai-panel ${styles.section}`}>
      <HeadingWithIcon
        as="p"
        icon={<FiMonitor aria-hidden="true" />}
        className={styles.title}
      >
        Diagnostics Display
      </HeadingWithIcon>
      <div className="grid gap-3">
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
      </div>
    </section>
  );
}
