"use client";

import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { FiSliders } from "@react-icons/all-files/fi/FiSliders";
import { FiTarget } from "@react-icons/all-files/fi/FiTarget";
import { FiZap } from "@react-icons/all-files/fi/FiZap";

import { cn } from "@/components/ui/utils";
import { GridPanel, SelectableTile } from "@/components/ui/grid-panel";
import { setLastDiffReason } from "@/lib/chat/historyPreviewDiffTelemetry";
import {
  type AdminChatConfig,
  type SessionChatConfig,
} from "@/types/chat-config";

import type { ImpactKey } from "./impact";
import drawerStyles from "./ChatAdvancedSettingsDrawer.module.css";
import styles from "./SettingsSectionPresets.module.css";
import {
  computeOverridesActive,
  PRESET_LABELS,
  type PresetKey,
} from "./preset-overrides";

const PRESET_ICONS: Record<PresetKey, React.ReactNode> = {
  precision: <FiTarget size={14} className={styles.presetIcon} aria-hidden="true" />,
  default: <FiSliders size={14} className={styles.presetIcon} aria-hidden="true" />,
  highRecall: <FiLayers size={14} className={styles.presetIcon} aria-hidden="true" />,
  fast: <FiZap size={14} className={styles.presetIcon} aria-hidden="true" />,
};

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
          <span className="ml-auto inline-flex rounded-full border border-[color:var(--ai-border-muted)] bg-[color:var(--ai-accent-soft)] px-2 py-0.5 t-eyebrow text-[color:var(--ai-text)]">
            Custom
          </span>
        )}
      </div>
      <GridPanel
        className={cn(
          "grid-cols-4 gap-[0.3rem]",
          drawerStyles.drawerSelectableScope,
          styles.presetGrid,
        )}
      >
        {(["fast", "default", "precision", "highRecall"] as PresetKey[]).map(
          (key) => {
            const isActive = sessionConfig.appliedPreset === key;
            return (
              <SelectableTile
                key={key}
                active={isActive}
                onClick={() => applyPreset(key)}
                label={PRESET_LABELS[key]}
                icon={PRESET_ICONS[key]}
                data-preset={key}
                className={cn(
                  styles.presetTile,
                  isActive && styles.presetTileActive,
                  "flex flex-col items-center justify-center !text-center h-full w-full",
                )}
                contentClassName="ai-choice !gap-1 w-full"
                labelClassName={cn("ai-choice__label", styles.presetLabel)}
              />
            );
          },
        )}
      </GridPanel>
    </div>
  );
}
