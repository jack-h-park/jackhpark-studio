"use client";

import type {
  AdminChatConfig,
  SessionChatConfig,
} from "@/types/chat-config";

type PresetKey = "default" | "fast" | "highRecall";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
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
  setSessionConfig,
}: Props) {
  const applyPreset = (presetKey: PresetKey) => {
    setSessionConfig(() => ({
      ...adminConfig.presets[presetKey],
      appliedPreset: presetKey,
    }));
  };

  return (
    <section className="settings-section">
      <p className="settings-section__title">Presets</p>
      <div className="settings-section__grid">
        {(["default", "fast", "highRecall"] as PresetKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => applyPreset(key)}
            className={`settings-section__preset ${
              sessionConfig.appliedPreset === key
                ? "settings-section__preset--active"
                : ""
            }`}
            aria-pressed={sessionConfig.appliedPreset === key}
          >
            {PRESET_LABELS[key]}
          </button>
        ))}
      </div>
    </section>
  );
}
