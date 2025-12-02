"use client";

import { FiTarget } from "@react-icons/all-files/fi/FiTarget";

import type { RankerId } from "@/lib/shared/models";
import type {
  AdminChatConfig,
  SessionChatConfig,
  SummaryLevel,
} from "@/types/chat-config";
import { Checkbox } from "@/components/ui/checkbox";
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

  return (
    <Section>
      <SectionHeader>
        <SectionTitle
          id="settings-rag-title"
          as="p"
          icon={<FiTarget aria-hidden="true" />}
        >
          Retrieval (RAG)
        </SectionTitle>
        <Switch
          className="flex-shrink-0"
          aria-labelledby="settings-rag-title"
          checked={isRagEnabled}
          onCheckedChange={(checked) =>
            updateSession((prev) => ({
              ...prev,
              rag: { ...prev.rag, enabled: checked },
            }))
          }
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
            disabled={!isRagEnabled}
            onChange={(topK) => {
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
            }}
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
            disabled={!isRagEnabled}
            onChange={(similarity) =>
              updateSession((prev) => ({
                ...prev,
                rag: {
                  ...prev.rag,
                  similarity,
                },
              }))
            }
          />
        </div>

        <div className="ai-field pt-2">
          <Label className="ai-field__label">Capabilities</Label>
          <div className="flex flex-col gap-3 pl-1">
            {adminConfig.allowlist.allowReverseRAG && (
              <div className="inline-flex items-center gap-2 text-sm">
                <Checkbox
                  className="flex-shrink-0"
                  checked={sessionConfig.features.reverseRAG}
                  disabled={!isRagEnabled}
                  onCheckedChange={(checked) =>
                    updateSession((prev) => ({
                      ...prev,
                      features: {
                        ...prev.features,
                        reverseRAG: checked,
                      },
                    }))
                  }
                  aria-label="Enable Reverse RAG"
                />
                <span className="ai-choice__label">Reverse RAG</span>
              </div>
            )}

            {adminConfig.allowlist.allowHyde && (
              <div className="inline-flex items-center gap-2">
                <Checkbox
                  className="flex-shrink-0"
                  checked={sessionConfig.features.hyde}
                  disabled={!isRagEnabled}
                  onCheckedChange={(checked) =>
                    updateSession((prev) => ({
                      ...prev,
                      features: {
                        ...prev.features,
                        hyde: checked,
                      },
                    }))
                  }
                  aria-label="Enable HyDE"
                />
                <span className="ai-choice__label">HyDE</span>
              </div>
            )}
          </div>
        </div>

        <div className="ai-field pt-2">
          <Label htmlFor="settings-ranker" className="ai-field__label">
            Ranker
          </Label>
          <Select
            value={sessionConfig.features.ranker}
            onValueChange={(value) =>
              updateSession((prev) => ({
                ...prev,
                features: {
                  ...prev.features,
                  ranker: value as RankerId,
                },
              }))
            }
            disabled={!isRagEnabled}
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
                onClick={() =>
                  updateSession((prev) => ({
                    ...prev,
                    summaryLevel: option.value,
                  }))
                }
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
