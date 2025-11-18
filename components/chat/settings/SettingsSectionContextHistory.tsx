"use client";

import { FiClock } from "@react-icons/all-files/fi/FiClock";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { Input } from "@/components/ui/input";

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
          <div key={key} className="flex flex-col gap-1.5">
            <div className="flex justify-between items-baseline gap-3">
              <span>{label}</span>
              <span>{sessionConfig.context[key]}</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                className="w-full"
                min={limit.min}
                max={limit.max}
                step={1}
                value={sessionConfig.context[key]}
                onChange={(event) =>
                  updateSession((prev) => ({
                    ...prev,
                    context: {
                      ...prev.context,
                      [key]: Number(event.target.value),
                    },
                  }))
                }
              />
              <Input
                type="number"
                min={limit.min}
                max={limit.max}
                className="ai-field-sm ai-settings-section__number ai-settings-section__number--compact max-w-[110px] text-right"
                value={sessionConfig.context[key]}
                aria-label={`${label} value`}
                onChange={(event) =>
                  updateSession((prev) => ({
                    ...prev,
                    context: {
                      ...prev.context,
                      [key]: Math.round(
                        Number(event.target.value) || limit.min,
                      ),
                    },
                  }))
                }
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
