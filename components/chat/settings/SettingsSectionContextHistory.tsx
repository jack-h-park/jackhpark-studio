"use client";

import { FiClock } from "@react-icons/all-files/fi/FiClock";
import { useState } from "react";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { SliderField } from "@/components/ui/field";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";
import { Switch } from "@/components/ui/switch";

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
  const [isContextEnabled, setIsContextEnabled] = useState(true);

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
  const handleContextSliderChange = (
    key: keyof SessionChatConfig["context"],
    limit: {
      min: number;
      max: number;
    },
    value: number,
  ) => {
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
  };

  return (
    <Section>
      <SectionHeader>
        <SectionTitle
          id="settings-context-history-title"
          as="p"
          icon={<FiClock aria-hidden="true" />}
        >
          Context &amp; History
        </SectionTitle>
        <div className="flex items-center gap-2">
          <span className="sr-only" id="settings-context-history-toggle">
            Toggle Context &amp; History editing
          </span>
          <Switch
            className="flex-shrink-0"
            checked={isContextEnabled}
            aria-labelledby="settings-context-history-title settings-context-history-toggle"
            onCheckedChange={setIsContextEnabled}
          />
        </div>
      </SectionHeader>
      <SectionContent className="flex flex-col gap-3">
        {inputs.map(({ key, label, limit }) => (
          <SliderField
            key={key}
            id={`settings-${key}`}
            label={label}
            value={sessionConfig.context[key]}
            min={limit.min}
            max={limit.max}
            step={1}
            onChange={(value) => handleContextSliderChange(key, limit, value)}
            disabled={!isContextEnabled}
          />
        ))}
      </SectionContent>
    </Section>
  );
}
