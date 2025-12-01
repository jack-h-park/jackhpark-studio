"use client";

import { FiLayers } from "@react-icons/all-files/fi/FiLayers";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { GridPanel, SelectableTile } from "@/components/ui/grid-panel";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";

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
      additionalSystemPrompt:
        adminConfig.presets[presetKey].additionalSystemPrompt ?? "",
      appliedPreset: presetKey,
    }));
  };

  return (
    <Section>
      <SectionHeader>
        <SectionTitle as="p" icon={<FiLayers aria-hidden="true" />}>
          AI Orchestration Presets (Session-Wide)
        </SectionTitle>
      </SectionHeader>
      <SectionContent className="flex flex-col gap-3">
        {helperText && <p className="ai-meta-text">{helperText}</p>}
        <GridPanel className="grid-cols-3 gap-[0.3rem]">
          {(["default", "fast", "highRecall"] as PresetKey[]).map((key) => {
            const isActive = sessionConfig.appliedPreset === key;
            return (
              <SelectableTile
                key={key}
                active={isActive}
                onClick={() => applyPreset(key)}
              >
                <span className="ai-choice__label">{PRESET_LABELS[key]}</span>
              </SelectableTile>
            );
          })}
        </GridPanel>
      </SectionContent>
    </Section>
  );
}
