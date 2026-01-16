"use client";

import { GridPanel, SelectableTile } from "@/components/ui/grid-panel";
import { setLastDiffReason } from "@/lib/chat/historyPreviewDiffTelemetry";
import {
  type AdminChatConfig,
  type SessionChatConfig,
} from "@/types/chat-config";

import type { ImpactKey } from "./impact";
import drawerStyles from "./ChatAdvancedSettingsDrawer.module.css";
import {
  computeOverridesActive,
  PRESET_LABELS,
  type PresetKey,
} from "./preset-overrides";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  helperText?: string;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
  onDisruptiveChange?: (key: ImpactKey) => void;
};

export function PresetSelectorTabs({
  adminConfig,
  sessionConfig,
  helperText,
  setSessionConfig,
  onDisruptiveChange,
}: Props) {
  const overridesActive = computeOverridesActive({
    adminConfig,
    sessionConfig,
  });

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
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2 text-xs leading-tight text-[color:var(--ai-text-muted)]">
        {helperText && <p className="m-0">{helperText}</p>}
        {overridesActive && (
          <span className="ml-auto inline-flex rounded-full border border-[color:var(--ai-border-muted)] bg-[color:var(--ai-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ai-text)]">
            Custom
          </span>
        )}
      </div>
      <GridPanel
        className={`grid-cols-4 gap-[0.3rem] ${drawerStyles.drawerSelectableScope}`}
      >
        {(["precision", "default", "highRecall", "fast"] as PresetKey[]).map(
          (key) => {
            const isActive = sessionConfig.appliedPreset === key;
            return (
              <SelectableTile
                key={key}
                active={isActive}
                onClick={() => applyPreset(key)}
                label={PRESET_LABELS[key]}
                className="flex flex-col items-center justify-center !text-center h-full w-full"
                contentClassName="ai-choice !gap-1 w-full"
                labelClassName="ai-choice__label"
              />
            );
          },
        )}
      </GridPanel>
    </div>
  );
}
