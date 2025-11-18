"use client";

import { FiMonitor } from "@react-icons/all-files/fi/FiMonitor";

import { useChatDisplaySettings } from "@/components/chat/hooks/useChatDisplaySettings";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
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
    <section className="ai-panel ai-settings-section">
      <HeadingWithIcon
        as="p"
        icon={<FiMonitor aria-hidden="true" />}
        className="ai-settings-section__title"
      >
        Diagnostics Display
      </HeadingWithIcon>
      <div className="flex flex-col gap-3">
        <div className="ai-settings-toggle flex items-center justify-between gap-3 px-3 py-2 rounded-2xl border border-[color:var(--ai-border)] bg-[color:var(--ai-bg-muted)]">
          <div className="ai-settings-toggle__content flex-1">
            <span id="telemetry-label" className="ai-section-title">
              Telemetry badges
            </span>
            <p className="ai-settings-toggle__description mt-0.5 text-xs text-slate-500">
              Show engine, guardrail, and enhancement insights.
            </p>
          </div>
          <Switch
            id="telemetry-switch"
            className="ai-settings-toggle__switch inline-flex flex-shrink-0"
            checked={showTelemetry}
            aria-labelledby="telemetry-label"
            aria-label="Toggle telemetry badges"
            onCheckedChange={setShowTelemetry}
          />
        </div>

        <div className="ai-settings-toggle flex items-center justify-between gap-3 px-3 py-2 rounded-2xl border border-[color:var(--ai-border)] bg-[color:var(--ai-bg-muted)]">
          <div className="ai-settings-toggle__content flex-1">
            <span
              id="telemetry-expand-label"
              className="ai-section-title"
            >
              Auto expand telemetry on toggle
            </span>
            <p className="ai-settings-toggle__description mt-0.5 text-xs text-slate-500">
              Expand the telemetry drawer whenever telemetry badges are enabled.
            </p>
          </div>
          <Switch
            className="ai-settings-toggle__switch inline-flex flex-shrink-0"
            checked={telemetryAutoExpand}
            aria-labelledby="telemetry-expand-label"
            aria-label="Toggle auto expand telemetry"
            onCheckedChange={setTelemetryAutoExpand}
          />
        </div>

        <div className="ai-settings-toggle flex items-center justify-between gap-3 px-3 py-2 rounded-2xl border border-[color:var(--ai-border)] bg-[color:var(--ai-bg-muted)]">
          <div className="ai-settings-toggle__content flex-1">
            <span id="citations-label" className="ai-section-title">
              Citations
            </span>
            <p className="ai-settings-toggle__description mt-0.5 text-xs text-slate-500">
              Show every retrieved source (may include tiny text excerpts).
            </p>
          </div>
          <Switch
            className="ai-settings-toggle__switch inline-flex flex-shrink-0"
            checked={showCitations}
            aria-labelledby="citations-label"
            aria-label="Toggle citations"
            onCheckedChange={setShowCitations}
          />
        </div>
      </div>
    </section>
  );
}
