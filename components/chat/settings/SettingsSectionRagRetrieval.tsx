"use client";

import { FiTarget } from "@react-icons/all-files/fi/FiTarget";

import type { RankerId } from "@/lib/shared/models";
import type {
  AdminChatConfig,
  SessionChatConfig,
  SummaryLevel,
} from "@/types/chat-config";
import { CheckboxChoice } from "@/components/ui/checkbox";
import { GridPanel, SelectableTile } from "@/components/ui/grid-panel";
import { Label } from "@/components/ui/label";
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
import { SliderNumberField } from "@/components/ui/slider-number-field";
import { Switch } from "@/components/ui/switch";
import { isSettingLocked } from "@/lib/shared/chat-settings-policy";

const SUMMARY_LEVELS: Record<SummaryLevel, string> = {
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
};

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
};

export function SettingsSectionRagRetrieval({
  adminConfig,
  sessionConfig,
  setSessionConfig,
}: Props) {
  const isRagLocked = isSettingLocked("rag");
  const isFeaturesLocked = isSettingLocked("features");

  const updateSession = (
    updater: (next: SessionChatConfig) => SessionChatConfig,
  ) => {
    setSessionConfig((prev) => ({
      ...updater(prev),
      appliedPreset: undefined,
    }));
  };

  const { ragTopK, similarityThreshold } = adminConfig.numericLimits;
  const { summaryPresets } = adminConfig;
  const isRagEnabled = sessionConfig.rag.enabled;

  const summaryOptions = [
    {
      value: "off" as const,
      label: SUMMARY_LEVELS.off,
      description: "No summaries",
    },
    {
      value: "low" as const,
      label: SUMMARY_LEVELS.low,
      description: `Run every ${summaryPresets.low.every_n_turns} turns`,
    },
    {
      value: "medium" as const,
      label: SUMMARY_LEVELS.medium,
      description: `Run every ${summaryPresets.medium.every_n_turns} turns`,
    },
    {
      value: "high" as const,
      label: SUMMARY_LEVELS.high,
      description: `Run every ${summaryPresets.high.every_n_turns} turns`,
    },
  ];
  const handleRagEnabledChange = (enabled: boolean) => {
    updateSession((prev) => ({
      ...prev,
      rag: { ...prev.rag, enabled },
    }));
  };

  const handleTopKChange = (topK: number) => {
    const sanitized = Math.max(
      ragTopK.min,
      Math.min(ragTopK.max, Math.round(topK)),
    );
    updateSession((prev) => ({
      ...prev,
      rag: {
        ...prev.rag,
        topK: sanitized,
      },
    }));
  };

  const handleSimilarityChange = (similarity: number) => {
    updateSession((prev) => ({
      ...prev,
      rag: {
        ...prev.rag,
        similarity,
      },
    }));
  };

  const handleFeatureToggle = (
    feature: "reverseRAG" | "hyde",
    checked: boolean,
  ) => {
    updateSession((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [feature]: checked,
      },
    }));
  };

  const handleRankerChange = (value: string) => {
    updateSession((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        ranker: value as RankerId,
      },
    }));
  };

  const handleSummaryLevelChange = (level: SummaryLevel) => {
    updateSession((prev) => ({
      ...prev,
      summaryLevel: level,
    }));
  };

  return (
    <Section>
      <SectionHeader>
        <SectionTitle
          id="settings-rag-title"
          as="div"
          className="flex items-center gap-2"
          icon={<FiTarget aria-hidden="true" />}
        >
          <span>Retrieval (RAG)</span>
          {isRagLocked && (
            <span className="ml-2 inline-flex items-center rounded-sm border border-muted-foreground/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Managed by Preset
            </span>
          )}
        </SectionTitle>
        <Switch
          className="flex-shrink-0"
          aria-labelledby="settings-rag-title"
          checked={isRagEnabled}
          onCheckedChange={handleRagEnabledChange}
          disabled={isRagLocked}
        />
      </SectionHeader>

      <SectionContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-3">
          <SliderNumberField
            id="settings-top-k"
            label="Top K"
            value={sessionConfig.rag.topK}
            min={ragTopK.min}
            max={ragTopK.max}
            step={1}
            disabled={!isRagEnabled || isRagLocked}
            onChange={handleTopKChange}
          />
        </div>

        <div className="flex flex-col gap-3">
          <SliderNumberField
            id="settings-similarity-threshold"
            label="Similarity Threshold"
            value={sessionConfig.rag.similarity}
            min={similarityThreshold.min}
            max={similarityThreshold.max}
            step={0.01}
            disabled={!isRagEnabled || isRagLocked}
            onChange={handleSimilarityChange}
          />
        </div>

        <div className="ai-field pt-2">
          <Label className="ai-field__label">
            Capabilities {isFeaturesLocked && "(Locked by Preset)"}
          </Label>
          <div className="flex flex-col gap-3 pl-1">
            {adminConfig.allowlist.allowReverseRAG && (
              <CheckboxChoice
                label="Reverse RAG"
                checked={sessionConfig.features.reverseRAG}
                disabled={!isRagEnabled || isFeaturesLocked}
                onCheckedChange={(checked) =>
                  handleFeatureToggle("reverseRAG", checked)
                }
              />
            )}

            {adminConfig.allowlist.allowHyde && (
              <CheckboxChoice
                label="HyDE"
                checked={sessionConfig.features.hyde}
                disabled={!isRagEnabled || isFeaturesLocked}
                onCheckedChange={(checked) =>
                  handleFeatureToggle("hyde", checked)
                }
              />
            )}
          </div>
        </div>

        <div className="ai-field pt-2">
          <Label htmlFor="settings-ranker" className="ai-field__label">
            Ranker
          </Label>
          <Select
            value={sessionConfig.features.ranker}
            onValueChange={handleRankerChange}
            disabled={!isRagEnabled || isFeaturesLocked}
          >
            <SelectTrigger
              id="settings-ranker"
              aria-label="Ranker selection"
              className="ai-field-sm w-full"
            />
            <SelectContent>
              {adminConfig.allowlist.rankers.map((ranker) => (
                <SelectItem key={ranker} value={ranker}>
                  {ranker.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ai-field border-t border-[color:var(--ai-border-muted)] pt-4">
          <Label className="ai-field__label">Summaries</Label>
          <GridPanel className="grid-cols-2 gap-2">
            {summaryOptions.map((option) => (
              <SelectableTile
                key={option.value}
                active={sessionConfig.summaryLevel === option.value}
                disabled={!isRagEnabled}
                onClick={() => handleSummaryLevelChange(option.value)}
              >
                <div className="ai-choice">
                  <span className="ai-choice__label">{option.label}</span>
                  <p className="ai-choice__description">{option.description}</p>
                </div>
              </SelectableTile>
            ))}
          </GridPanel>
        </div>
      </SectionContent>
    </Section>
  );
}
