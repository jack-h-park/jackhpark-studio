"use client";

import { FiLayers } from "@react-icons/all-files/fi/FiLayers";

import { GridPanel, SelectableTile } from "@/components/ui/grid-panel";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";
import { setLastDiffReason } from "@/lib/chat/historyPreviewDiffTelemetry";
import {
  type AdminChatConfig,
  type SessionChatConfig,
} from "@/types/chat-config";

import type { ImpactKey } from "./impact";
import { ImpactBadge } from "./ImpactBadge";

type PresetKey = "precision" | "default" | "fast" | "highRecall";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  helperText?: string;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
  onDisruptiveChange?: (key: ImpactKey) => void;
};

const PRESET_LABELS: Record<PresetKey, string> = {
  precision: "Precision",
  default: "Balanced (Default)",
  fast: "Fast",
  highRecall: "High Recall",
};

export function SettingsSectionPresets({
  adminConfig,
  sessionConfig,
  helperText,
  setSessionConfig,
  onDisruptiveChange,
}: Props) {
  const applyPreset = (presetKey: PresetKey) => {
    setSessionConfig(() => ({
      ...adminConfig.presets[presetKey],
      presetId: presetKey,
      additionalSystemPrompt:
        adminConfig.presets[presetKey].additionalSystemPrompt ?? "",
      appliedPreset: presetKey,
    }));
    onDisruptiveChange?.("preset");
    setLastDiffReason("preset");
  };

  return (
    <Section>
      <SectionHeader>
        <SectionTitle as="p" icon={<FiLayers aria-hidden="true" />}>
          AI Orchestration Presets (Session-Wide)
          <ImpactBadge controlId="preset" />
        </SectionTitle>
      </SectionHeader>
      <SectionContent className="flex flex-col gap-3">
        {helperText && <p className="ai-meta-text">{helperText}</p>}
        <GridPanel className="grid-cols-4 gap-[0.3rem]">
          {(["precision", "default", "highRecall", "fast"] as PresetKey[]).map(
            (key) => {
              const isActive = sessionConfig.appliedPreset === key;
              return (
                <SelectableTile
                  key={key}
                  active={isActive}
                  onClick={() => applyPreset(key)}
                  className="flex flex-col items-center justify-center !text-center h-full w-full"
                >
                  <span className="ai-choice__label">{PRESET_LABELS[key]}</span>
                </SelectableTile>
              );
            },
          )}
        </GridPanel>
      </SectionContent>
    </Section>
  );
}
