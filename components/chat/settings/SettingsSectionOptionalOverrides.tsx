"use client";

import { FiInfo } from "@react-icons/all-files/fi/FiInfo";
import { FiSliders } from "@react-icons/all-files/fi/FiSliders";
import { useMemo } from "react";

import type { LlmModelId } from "@/lib/shared/models";
import { useChatConfig } from "@/components/chat/context/ChatConfigContext";
import { SelectableTile } from "@/components/shared/selectable-tile";
import { SelectField } from "@/components/ui/field";
import { GridPanel } from "@/components/ui/grid-panel";
import { ImpactTooltip } from "@/components/ui/impact-tooltip";
import { Label } from "@/components/ui/label";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";
import { cn } from "@/components/ui/utils";
import { listAllLlmModelOptions } from "@/lib/core/llm-registry";
import { SUMMARY_LEVEL_LABELS } from "@/lib/shared/chat-labels";
import {
  type AdminChatConfig,
  type SessionChatConfig,
  type SummaryLevel,
} from "@/types/chat-config";

import drawerStyles from "./ChatAdvancedSettingsDrawer.module.css";
import {
  createSessionOverrideUpdater,
  getPresetDefaults,
  resolvePresetKey,
} from "./preset-overrides";
import styles from "./SettingsSectionOptionalOverrides.module.css";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
};

export function SettingsSectionOptionalOverrides({
  adminConfig,
  sessionConfig,
  setSessionConfig,
}: Props) {
  const { runtimeMeta } = useChatConfig();

  const presetDefaults = useMemo(
    () => getPresetDefaults(adminConfig, resolvePresetKey(sessionConfig)),
    [adminConfig, sessionConfig],
  );

  const updateSession = createSessionOverrideUpdater(setSessionConfig);

  const llmOptions = useMemo(() => {
    const allowlist = new Set(adminConfig.allowlist.llmModels);
    const allOptions = listAllLlmModelOptions();
    const availableOptions = allOptions.filter((option) => {
      if (!option.isLocal) return true;
      if (option.provider === "ollama") return runtimeMeta.ollamaConfigured;
      if (option.provider === "lmstudio") return runtimeMeta.lmstudioConfigured;
      return true;
    });
    const filtered = availableOptions.filter((option) =>
      allowlist.has(option.id as LlmModelId),
    );
    return filtered.length > 0 ? filtered : availableOptions;
  }, [
    adminConfig.allowlist.llmModels,
    runtimeMeta.ollamaConfigured,
    runtimeMeta.lmstudioConfigured,
  ]);

  const llmDiffLabel = useMemo(() => {
    if (sessionConfig.llmModel === presetDefaults.llmModel) return null;
    return (
      llmOptions.find((o) => o.id === presetDefaults.llmModel)?.label ??
      presetDefaults.llmModel
    );
  }, [sessionConfig.llmModel, presetDefaults.llmModel, llmOptions]);

  const summaryOptions = [
    {
      value: "off" as const,
      label: SUMMARY_LEVEL_LABELS.off,
      description: "No summaries",
    },
    {
      value: "low" as const,
      label: SUMMARY_LEVEL_LABELS.low,
      description: `Run every ${adminConfig.summaryPresets.low.every_n_turns} turns`,
    },
    {
      value: "medium" as const,
      label: SUMMARY_LEVEL_LABELS.medium,
      description: `Run every ${adminConfig.summaryPresets.medium.every_n_turns} turns`,
    },
    {
      value: "high" as const,
      label: SUMMARY_LEVEL_LABELS.high,
      description: `Run every ${adminConfig.summaryPresets.high.every_n_turns} turns`,
    },
  ];

  const handleSummaryLevelChange = (level: SummaryLevel) => {
    updateSession((prev) => ({
      ...prev,
      summaryLevel: level,
    }));
  };

  const handleLlModelChange = (value: string) => {
    updateSession((prev) => ({
      ...prev,
      llmModel: value as LlmModelId,
    }));
  };


  return (
    <Section>
      <SectionHeader>
        <div className="flex items-center gap-2">
          <SectionTitle
            as="div"
            className="flex items-center gap-2"
            icon={<FiSliders aria-hidden="true" />}
          >
            <span>Optional Overrides</span>
          </SectionTitle>
          <ImpactTooltip text="Overrides can change cost/speed and output behavior compared to the preset.">
            <FiInfo aria-hidden="true" />
          </ImpactTooltip>
        </div>
      </SectionHeader>
      <SectionContent className="flex flex-col gap-3">
        <p className="ai-setting-section-description">
          Session-only preferences. Core retrieval, memory, and safety behavior
          is controlled by the selected preset.
        </p>

        <div className={styles.overrideBlocks}>
          <div className={cn(styles.overrideBlock, "space-y-2")}>
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor="optional-llm-model"
                className={cn("ai-field__label", styles.overlineLabel)}
              >
                LLM Model
              </Label>
              {llmDiffLabel && (
                <span className={styles.diffPill}>
                  Preset: {llmDiffLabel}
                </span>
              )}
            </div>
            <SelectField
              id="optional-llm-model"
              ariaLabel="LLM model selection"
              value={sessionConfig.llmModel}
              onValueChange={handleLlModelChange}
              options={llmOptions.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
            />
          </div>

          <div className={cn(styles.overrideBlock, "space-y-2")}>
            <div className={cn("flex items-baseline", styles.summaryLabelRow)}>
              <Label className={cn("ai-field__label", styles.overlineLabel)}>
                Summaries
              </Label>
            </div>
            <GridPanel
              className={cn(
                "grid-cols-2",
                styles.summaryGrid,
                drawerStyles.drawerSelectableScope,
              )}
            >
              {summaryOptions.map((option) => {
                const isPresetDefault =
                  presetDefaults.summaryLevel === option.value;
                return (
                  <SelectableTile
                    key={option.value}
                    name="chat-summary-level"
                    value={option.value}
                    checked={sessionConfig.summaryLevel === option.value}
                    disabled={!sessionConfig.rag.enabled}
                    onChange={handleSummaryLevelChange}
                    label={option.label}
                    description={option.description}
                    align="center"
                    className={cn(
                      "h-full w-full max-w-full",
                      isPresetDefault && styles.summaryTileDefault,
                    )}
                    descriptionClassName="tracking-normal"
                  />
                );
              })}
            </GridPanel>
          </div>

        </div>
      </SectionContent>
    </Section>
  );
}

