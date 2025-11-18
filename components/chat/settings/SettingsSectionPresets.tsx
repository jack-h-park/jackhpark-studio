"use client";

import { FiLayers } from "@react-icons/all-files/fi/FiLayers";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";

type PresetKey = "default" | "fast" | "highRecall";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  helperText?: string;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
};

const PRESET_LABELS: Record<PresetKey, string> = {
  default: "Default",
  fast: "Fast",
  highRecall: "High Recall",
};

export function SettingsSectionPresets({
  adminConfig,
  sessionConfig,
  helperText,
  setSessionConfig,
}: Props) {
  const applyPreset = (presetKey: PresetKey) => {
    setSessionConfig(() => ({
      ...adminConfig.presets[presetKey],
      appliedPreset: presetKey,
    }));
  };

  return (
    <section className="ai-panel ai-settings-section">
      <HeadingWithIcon
        as="p"
        icon={<FiLayers aria-hidden="true" />}
        className="ai-settings-section__title"
      >
        AI Orchestration Presets
      </HeadingWithIcon>
      {helperText && <p className="ai-meta-text">{helperText}</p>}
      <div className="presets-grid">
        {(["default", "fast", "highRecall"] as PresetKey[]).map((key) => {
          const isActive = sessionConfig.appliedPreset === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              aria-pressed={isActive}
              className={`presets-grid__item rounded-2xl border px-4 py-3 text-left font-semibold text-sm transition ${
                isActive
                  ? "border-[color:var(--ai-accent)] bg-[color:var(--ai-accent-bg)] text-[color:var(--ai-accent-strong)] shadow-[0_8px_20px_rgba(15,15,15,0.2)]"
                  : "border-[color:var(--ai-border)] bg-[color:var(--ai-bg-muted)] text-[color:var(--ai-text)] hover:border-[color:var(--ai-text-strong)]"
              }`}
            >
              {PRESET_LABELS[key]}
            </button>
          );
        })}
      </div>
    </section>
  );
}
