"use client";

import { FiBookOpen } from "@react-icons/all-files/fi/FiBookOpen";

import type {
  AdminChatConfig,
  SessionChatConfig,
  SummaryLevel,
} from "@/types/chat-config";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { Radiobutton } from "@/components/ui/radiobutton";

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
    <section className="ai-panel ai-settings-section">
      <HeadingWithIcon
        as="p"
        icon={<FiBookOpen aria-hidden="true" />}
        className="ai-settings-section__title"
      >
        Summaries
      </HeadingWithIcon>
      <div className="grid gap-3">
        {summaryOptions.map((option) => (
          <Radiobutton
            key={option.value}
            variant="tile"
            name="session-summary-level"
            value={option.value}
            label={option.label}
            description={option.description}
            checked={sessionConfig.summaryLevel === option.value}
            onChange={() => updateSummaryLevel(option.value)}
          />
        ))}
      </div>
    </section>
  );
}
