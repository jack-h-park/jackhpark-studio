"use client";

import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiSliders } from "@react-icons/all-files/fi/FiSliders";
import { FiX } from "@react-icons/all-files/fi/FiX";
import { useEffect, useMemo, useState } from "react";

import type { LlmModelId } from "@/lib/shared/models";
import { useChatConfig } from "@/components/chat/context/ChatConfigContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import { GridPanel, SelectableTile } from "@/components/ui/grid-panel";
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
import { listAllLlmModelOptions } from "@/lib/core/llm-registry";
import {
  type AdminChatConfig,
  getAdditionalPromptMaxLength,
  type SessionChatConfig,
  type SummaryLevel,
} from "@/types/chat-config";

import { ImpactBadge } from "./ImpactBadge";
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
        <SectionTitle
          as="div"
          className="flex items-center gap-2"
          icon={<FiSliders aria-hidden="true" />}
        >
          <span>Optional Overrides</span>
        </SectionTitle>
      </SectionHeader>
      <SectionContent className="flex flex-col gap-3">
        <p className="ai-setting-section-description">
          Session-only preferences. Core retrieval, memory, and safety behavior
          is controlled by the selected preset.
        </p>

        {showOverridesWarning && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-[color:var(--ai-border-warning)] bg-[color:var(--ai-bg-surface-elevated)] p-3 text-sm text-[color:var(--ai-text-default)]"
          >
            <FiAlertTriangle
              className="mt-0.5 text-[color:var(--ai-text-warning)]"
              aria-hidden="true"
            />
            <div className="flex-1 space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider">
                Overrides active
              </p>
              <p className="text-[color:var(--ai-text-muted)]">
                These changes may affect cost, speed, or memory. Reset to preset
                defaults to revert.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="-mt-0.5 h-5 w-5 hover:bg-[color:var(--ai-bg-surface-hover)]"
              onClick={() => setWarningDismissed(true)}
              aria-label="Dismiss overrides warning"
            >
              <FiX className="h-3.5 w-3.5 text-[color:var(--ai-text-muted)]" />
            </Button>
          </div>
        )}

        {overridesActive && (
          <Button
            variant="ghost"
            className="self-start px-0 text-[11px] text-[color:var(--ai-text-muted)] hover:text-[color:var(--ai-text-default)]"
            onClick={handleResetToPresetDefaults}
          >
            Reset to Preset Defaults
          </Button>
        )}

        <div className={styles.overrideBlocks}>
          <div className={cn(styles.overrideBlock, "space-y-2")}>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="optional-llm-model"
                className={cn("ai-field__label", styles.overlineLabel)}
              >
                LLM Model
              </Label>
              <ImpactBadge label="May change cost/speed" />
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
            <div className="flex items-center gap-2">
              <Label className={cn("ai-field__label", styles.overlineLabel)}>
                Summaries
              </Label>
              <ImpactBadge label="May increase cost" />
            </div>
            <GridPanel className="grid-cols-2 gap-1">
              {summaryOptions.map((option) => {
                const isActive = sessionConfig.summaryLevel === option.value;
                return (
                  <SelectableTile
                    key={option.value}
                    active={isActive}
                    disabled={!sessionConfig.rag.enabled}
                    onClick={() => handleSummaryLevelChange(option.value)}
                    className={
                      isActive
                        ? ""
                        : cn(
                            "bg-[color:var(--ai-bg-surface-muted)] text-[color:var(--ai-text-muted)] shadow-none opacity-75",
                            styles.summaryTileInactive,
                          )
                    }
                  >
                    <div
                      className={cn(
                        "ai-choice !gap-1",
                        styles.summaryChoiceContent,
                        isActive
                          ? "px-[0.6rem] py-[0.6rem]"
                          : "px-[0.45rem] py-[0.45rem] text-[color:var(--ai-text-muted)]",
                        !isActive && styles.summaryChoiceContentInactive,
                      )}
                    >
                      <span className="ai-choice__label">{option.label}</span>
                      <p className="ai-choice__description text-[10px] text-[color:var(--ai-text-muted)]">
                        {option.description}
                      </p>
                    </div>
                  </SelectableTile>
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
  const [isEditing, setIsEditing] = useState(false);
  const trimmed = value.trim();

  if (!isEditing) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Label className={cn("ai-field__label", styles.overlineLabel)}>
              User system prompt
            </Label>
            <ImpactBadge label="May change output" />
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className={cn(
              styles.inlineUtilityAction,
              "underline-offset-2 hover:underline",
            )}
          >
            Edit prompt
          </button>
        </div>
        <div
          className="rounded border border-[color:var(--ai-border-muted)] bg-[color:var(--ai-surface-muted)] px-3 py-2 text-sm text-[color:var(--ai-text-muted)] transition hover:border-[color:var(--ai-border-default)]"
          tabIndex={0}
          role="button"
          onClick={() => setIsEditing(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsEditing(true);
            }
          }}
        >
          <p
            className="text-sm leading-relaxed"
            aria-label={trimmed || "No prompt configured"}
          >
            {trimmed || "No custom prompt yet."}
          </p>
        </div>
        <p className={helperClassName ?? "ai-setting-section-description"}>
          {helperText}
        </p>
      </div>
    );
  }

  return (
    <PromptWithCounter
      label={
        <span className="inline-flex items-center gap-2">
          <span>User system prompt</span>
          <ImpactBadge label="May change output" />
        </span>
      }
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
