"use client";

import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { FiSliders } from "@react-icons/all-files/fi/FiSliders";
import { FiTarget } from "@react-icons/all-files/fi/FiTarget";
import { FiZap } from "@react-icons/all-files/fi/FiZap";

import { SelectableTile } from "@/components/shared/selectable-tile";
import { GridPanel } from "@/components/ui/grid-panel";
import { cn } from "@/components/ui/utils";
import { setLastDiffReason } from "@/lib/chat/historyPreviewDiffTelemetry";
import { PRESET_DISPLAY_ORDER } from "@/lib/shared/chat-labels";
import {
  type AdminChatConfig,
  type SessionChatConfig,
} from "@/types/chat-config";

import drawerStyles from "./ChatAdvancedSettingsDrawer.module.css";
import {
  computeOverridesActive,
  PRESET_LABELS,
  type PresetKey,
} from "./preset-overrides";
import styles from "./SettingsSectionPresets.module.css";

const PRESET_TILE_CLASSES: Record<PresetKey, string> = {
  precision: styles.presetTilePrecision,
  default: styles.presetTileDefault,
  highRecall: styles.presetTileRecall,
  fast: styles.presetTileFast,
};

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
};

export function PresetSelectorTabs({
  adminConfig,
  sessionConfig,
  helperText,
  setSessionConfig,
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
        )}
      >
        {PRESET_DISPLAY_ORDER.map((key) => (
          <SelectableTile
            key={key}
            name="chat-preset"
            value={key}
            checked={sessionConfig.appliedPreset === key}
            onChange={applyPreset}
            label={PRESET_LABELS[key]}
            icon={PRESET_ICONS[key]}
            align="center"
            className={cn(PRESET_TILE_CLASSES[key], "h-full w-full")}
          />
        ))}
      </GridPanel>
    </div>
  );
}
