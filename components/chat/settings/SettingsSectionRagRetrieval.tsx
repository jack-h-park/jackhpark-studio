"use client";

import { FiTarget } from "@react-icons/all-files/fi/FiTarget";

import type {
  AdminChatConfig,
  SessionChatConfig,
  SummaryLevel,
} from "@/types/chat-config";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { SliderNumberField } from "@/components/ui/slider-number-field";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Radiobutton } from "@/components/ui/radiobutton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { RankerId } from "@/lib/shared/models";

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
      description: "Disable conversation summaries.",
    },
    {
      value: "low" as const,
      label: SUMMARY_LEVELS.low,
      description: `Summaries run every ${summaryPresets.low.every_n_turns} turns.`,
    },
    {
      value: "medium" as const,
      label: SUMMARY_LEVELS.medium,
      description: `Summaries run every ${summaryPresets.medium.every_n_turns} turns.`,
    },
    {
      value: "high" as const,
      label: SUMMARY_LEVELS.high,
      description: `Summaries run every ${summaryPresets.high.every_n_turns} turns.`,
    },
  ];

  return (
    <section className="ai-panel ai-settings-section">
      <div className="ai-settings-section__header flex items-center justify-between gap-3">
        <HeadingWithIcon
          id="settings-rag-title"
          as="p"
          icon={<FiTarget aria-hidden="true" />}
          className="ai-settings-section__title"
        >
          Retrieval (RAG)
        </HeadingWithIcon>
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
      </div>

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

      <div className="grid gap-3 sm:grid-cols-2">
        {adminConfig.allowlist.allowReverseRAG && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--ai-bg-muted)] px-3 py-2">
            <p className="text-sm font-semibold text-[color:var(--ai-text-strong)]">
              Reverse RAG
            </p>
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
          </div>
        )}

        {adminConfig.allowlist.allowHyde && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--ai-bg-muted)] px-3 py-2">
            <p className="text-sm font-semibold text-[color:var(--ai-text-strong)]">
              HyDE
            </p>
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
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="settings-ranker">Ranker</Label>
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

      <div className="space-y-2 border-t border-[color:var(--ai-border-muted)] pt-3">
        <p className="text-sm font-semibold text-[color:var(--ai-text-strong)]">
          Summaries
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {summaryOptions.map((option) => (
            <Radiobutton
              key={option.value}
              variant="chip"
              name="settings-summary-level"
              value={option.value}
              label={option.label}
              description={option.description}
              checked={sessionConfig.summaryLevel === option.value}
              disabled={!isRagEnabled}
              onChange={() =>
                updateSession((prev) => ({
                  ...prev,
                  summaryLevel: option.value,
                }))
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}
