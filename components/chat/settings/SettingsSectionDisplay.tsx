"use client";

import { FiMonitor } from "@react-icons/all-files/fi/FiMonitor";

import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { Switch } from "@/components/ui/switch";

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
    <section className="settings-section">
      <p className="settings-section__title heading-with-icon">
        <FiMonitor aria-hidden="true" />
        Display
      </p>
      <div className="settings-section__field">
        <div className="settings-toggle">
          <div className="settings-toggle__content">
            <p className="settings-toggle__label">Telemetry badges</p>
            <p className="settings-toggle__description">
              Show engine, guardrail, and enhancement insights.
            </p>
          </div>
          <Switch
            className="settings-toggle__switch"
            checked={showTelemetry}
            onCheckedChange={setShowTelemetry}
            aria-label="Toggle telemetry badges"
          />
        </div>

        <div className="settings-toggle settings-toggle--muted">
          <div className="settings-toggle__content">
            <p className="settings-toggle__label">Auto expand telemetry on toggle</p>
            <p className="settings-toggle__description">
              Expand the telemetry drawer whenever telemetry badges are enabled.
            </p>
          </div>
          <Switch
            className="settings-toggle__switch"
            checked={telemetryAutoExpand}
            onCheckedChange={setTelemetryAutoExpand}
            aria-label="Toggle auto expand telemetry"
          />
        </div>

        <div className="settings-toggle">
          <div className="settings-toggle__content">
            <p className="settings-toggle__label">Citations</p>
            <p className="settings-toggle__description">
              Show every retrieved source (may include tiny text excerpts).
            </p>
          </div>
          <Switch
            className="settings-toggle__switch"
            checked={showCitations}
            onCheckedChange={setShowCitations}
            aria-label="Toggle citations"
          />
        </div>
      </div>
    </section>
  );
}
