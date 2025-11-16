"use client";

import type {
  AdminChatConfig,
  SessionChatConfig,
  SummaryLevel,
} from "@/types/chat-config";

type Props = {
  summaryPresets: AdminChatConfig["summaryPresets"];
  sessionConfig: SessionChatConfig;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
};

const LEVEL_LABELS: Record<SummaryLevel, string> = {
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function SettingsSectionSummaries({
  summaryPresets,
  sessionConfig,
  setSessionConfig,
}: Props) {
  const summaryOptions: Array<{
    value: SummaryLevel;
    label: string;
    description: string;
  }> = [
    {
      value: "off",
      label: LEVEL_LABELS.off,
      description: "Disable conversation summaries.",
    },
    {
      value: "low",
      label: LEVEL_LABELS.low,
      description: `Summaries run every ${summaryPresets.low.every_n_turns} turns.`,
    },
    {
      value: "medium",
      label: LEVEL_LABELS.medium,
      description: `Summaries run every ${summaryPresets.medium.every_n_turns} turns.`,
    },
    {
      value: "high",
      label: LEVEL_LABELS.high,
      description: `Summaries run every ${summaryPresets.high.every_n_turns} turns.`,
    },
  ];

  const updateSummaryLevel = (value: SummaryLevel) => {
    setSessionConfig((prev) => ({
      ...prev,
      summaryLevel: value,
      appliedPreset: undefined,
    }));
  };

  return (
    <section className="settings-section">
      <p className="settings-section__title">Summaries</p>
      <div className="settings-section__radio-group">
        {summaryOptions.map((option) => (
          <label key={option.value} className="settings-section__radio">
            <span>{option.label}</span>
            <input
              type="radio"
              name="summary-level"
              value={option.value}
              checked={sessionConfig.summaryLevel === option.value}
              onChange={() => updateSummaryLevel(option.value)}
            />
            <span className="description">{option.description}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
