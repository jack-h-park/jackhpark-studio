"use client";

import { FiInfo } from "@react-icons/all-files/fi/FiInfo";
import { FiSliders } from "@react-icons/all-files/fi/FiSliders";
import { useEffect, useMemo, useState } from "react";

import type { LlmModelId } from "@/lib/shared/models";
import { useChatConfig } from "@/components/chat/context/ChatConfigContext";
import { InlineAlert } from "@/components/ui/alert";
import { GridPanel, SelectableTile } from "@/components/ui/grid-panel";
import { ImpactTooltip } from "@/components/ui/ImpactTooltip";
import { Label } from "@/components/ui/label";
import { PromptWithCounter } from "@/components/ui/prompt-with-counter";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/components/ui/utils";
import { listAllLlmModelOptions } from "@/lib/core/llm-registry";
import {
  type AdminChatConfig,
  getAdditionalPromptMaxLength,
  type SessionChatConfig,
  type SummaryLevel,
} from "@/types/chat-config";

import drawerStyles from "./ChatAdvancedSettingsDrawer.module.css";
import { computeOverridesActive } from "./preset-overrides";
import styles from "./SettingsSectionOptionalOverrides.module.css";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
  onResetToPresetDefaults: () => void;
};

const SUMMARY_LEVELS: Record<SummaryLevel, string> = {
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function SettingsSectionOptionalOverrides({
  adminConfig,
  sessionConfig,
  setSessionConfig,
  onResetToPresetDefaults,
}: Props) {
  const { runtimeMeta } = useChatConfig();

  const updateSession = (
    updater: (next: SessionChatConfig) => SessionChatConfig,
  ) => {
    setSessionConfig((prev) => ({
      ...updater(prev),
      appliedPreset: undefined,
    }));
  };

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

  const summaryOptions = [
    {
      value: "off" as const,
      label: SUMMARY_LEVELS.off,
      description: "No summaries",
    },
    {
      value: "low" as const,
      label: SUMMARY_LEVELS.low,
      description: `Run every ${adminConfig.summaryPresets.low.every_n_turns} turns`,
    },
    {
      value: "medium" as const,
      label: SUMMARY_LEVELS.medium,
      description: `Run every ${adminConfig.summaryPresets.medium.every_n_turns} turns`,
    },
    {
      value: "high" as const,
      label: SUMMARY_LEVELS.high,
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

  const maxLength = getAdditionalPromptMaxLength(adminConfig);
  const helperText = [
    "Optional prompt applied only to this chat session.",
    "Based on the preset default and added on top of the base system prompt.",
    `Up to ${maxLength} characters.`,
  ].join(" ");

  const overridesActive = computeOverridesActive({
    adminConfig,
    sessionConfig,
  });
  const [warningDismissed, setWarningDismissed] = useState(false);
  const showOverridesWarning = overridesActive && !warningDismissed;

  useEffect(() => {
    if (!overridesActive) {
      setWarningDismissed(false);
    }
  }, [overridesActive]);

  const handleResetToPresetDefaults = () => {
    setWarningDismissed(false);
    onResetToPresetDefaults();
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
            <div className="flex items-center">
              <Label
                htmlFor="optional-llm-model"
                className={cn("ai-field__label", styles.overlineLabel)}
              >
                LLM Model
              </Label>
            </div>
            <Select
              value={sessionConfig.llmModel}
              onValueChange={handleLlModelChange}
            >
              <SelectTrigger
                id="optional-llm-model"
                aria-label="LLM model selection"
                className="ai-field-sm w-full"
              />
              <SelectContent>
                {llmOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                const isActive = sessionConfig.summaryLevel === option.value;
                return (
                  <SelectableTile
                    key={option.value}
                    active={isActive}
                    disabled={!sessionConfig.rag.enabled}
                    onClick={() => handleSummaryLevelChange(option.value)}
                    label={option.label}
                    description={option.description}
                    className={cn(
                      "flex flex-col items-center justify-center text-center h-full w-full max-w-full",
                    )}
                    contentClassName="ai-choice !gap-1 w-full"
                    labelClassName="ai-choice__label"
                    descriptionClassName="ai-choice__description tracking-normal"
                  />
                );
              })}
            </GridPanel>
          </div>

          <div className={cn(styles.overrideBlock, "space-y-2")}>
            <UserPromptEditor
              value={sessionConfig.additionalSystemPrompt ?? ""}
              maxLength={maxLength}
              helperText={helperText}
              helperClassName="ai-setting-section-description"
              onChange={(value) =>
                updateSession((prev) => ({
                  ...prev,
                  additionalSystemPrompt: value,
                }))
              }
            />
          </div>
        </div>
        {showOverridesWarning && (
          <InlineAlert
            severity="warning"
            title="Overrides active"
            className="mt-4"
            onDismiss={() => setWarningDismissed(true)}
            bodyClassName="ai-helper-text pt-1 space-y-1"
          >
            <p>
              These changes may affect cost, speed, or memory. Use the reset
              action to revert.
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-[color:var(--ai-accent-strong)] underline underline-offset-2"
              onClick={handleResetToPresetDefaults}
            >
              Reset to preset defaults
            </button>
          </InlineAlert>
        )}
      </SectionContent>
    </Section>
  );
}

type UserPromptEditorProps = {
  value: string;
  maxLength: number;
  helperText: string;
  helperClassName?: string;
  onChange: (value: string) => void;
};

function UserPromptEditor({
  value,
  maxLength,
  helperText,
  helperClassName,
  onChange,
}: UserPromptEditorProps) {
  return (
    <PromptWithCounter
      label="User system prompt"
      helperText={helperText}
      helperClassName={helperClassName}
      value={value}
      maxLength={maxLength}
      labelClassName={styles.overlineLabel}
      onChange={onChange}
      textareaClassName="min-h-[110px]"
    />
  );
}
