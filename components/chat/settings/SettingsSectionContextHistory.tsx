"use client";

import { FiClock } from "@react-icons/all-files/fi/FiClock";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { SliderNumberField } from "@/components/ui/slider-number-field";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
};

export function SettingsSectionContextHistory({
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

  const { contextBudget, historyBudget, clipTokens } =
    adminConfig.numericLimits;

  const inputs: Array<{
    key: keyof SessionChatConfig["context"];
    label: string;
    limit: AdminChatConfig["numericLimits"][keyof AdminChatConfig["numericLimits"]];
  }> = [
    {
      key: "tokenBudget",
      label: "Context Token Budget",
      limit: contextBudget,
    },
    {
      key: "historyBudget",
      label: "History Token Budget",
      limit: historyBudget,
    },
    {
      key: "clipTokens",
      label: "Clip Tokens",
      limit: clipTokens,
    },
  ];

  return (
    <section className="ai-panel ai-settings-section">
      <HeadingWithIcon
        as="p"
        icon={<FiClock aria-hidden="true" />}
        className="ai-settings-section__title"
      >
        Context &amp; History
      </HeadingWithIcon>
      <div className="flex flex-col gap-3">
        {inputs.map(({ key, label, limit }) => (
          <SliderNumberField
            key={key}
            id={`settings-${key}`}
            label={label}
            value={sessionConfig.context[key]}
            min={limit.min}
            max={limit.max}
            step={1}
            onChange={(value) => {
              const sanitized = Math.max(
                limit.min,
                Math.min(limit.max, Math.round(value)),
              );
              updateSession((prev) => ({
                ...prev,
                context: {
                  ...prev.context,
                  [key]: sanitized,
                },
              }));
            }}
          />
        ))}
      </div>
    </section>
  );
}
