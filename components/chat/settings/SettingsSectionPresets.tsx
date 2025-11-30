"use client";

import { FiLayers } from "@react-icons/all-files/fi/FiLayers";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { GridPanel, GridPanelItem } from "@/components/ui/grid-panel";
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
       presetId: presetKey,
       additionalSystemPrompt: "",
      appliedPreset: presetKey,
    }));
  };

  return (
    <section className="ai-panel ai-settings-section ai-settings-section--cascade-start">
      <HeadingWithIcon
        as="p"
        icon={<FiLayers aria-hidden="true" />}
        className="ai-settings-section__title"
      >
        AI Orchestration Presets (Session-Wide)
      </HeadingWithIcon>
      {helperText && <p className="ai-meta-text">{helperText}</p>}
      <GridPanel className="grid grid-cols-3 gap-[0.3rem]">
        {(["default", "fast", "highRecall"] as PresetKey[]).map((key) => {
          const isActive = sessionConfig.appliedPreset === key;
          return (
            <GridPanelItem
              key={key}
              active={isActive}
              onClick={() => applyPreset(key)}
            >
              <span className="ai-choice__label">{PRESET_LABELS[key]}</span>
            </GridPanelItem>
          );
        })}
      </GridPanel>
    </section>
  );
}
