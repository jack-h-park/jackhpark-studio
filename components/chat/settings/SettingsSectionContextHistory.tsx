"use client";

import { FiClock } from "@react-icons/all-files/fi/FiClock";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";

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
    <section className="settings-section">
      <p className="settings-section__title heading-with-icon">
        <FiClock aria-hidden="true" />
        Context &amp; History
      </p>
      <div className="settings-section__field">
        {inputs.map(({ key, label, limit }) => (
          <div key={key} className="settings-section__slider-field">
            <div className="settings-section__field-row">
              <span>{label}</span>
              <span>{sessionConfig.context[key]}</span>
            </div>
            <div className="settings-section__slider-row">
              <input
                type="range"
                className="settings-section__range"
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
              <input
                type="number"
                min={limit.min}
                max={limit.max}
                className="settings-section__number settings-section__number--compact"
                value={sessionConfig.context[key]}
                onChange={(event) =>
                  updateSession((prev) => ({
                    ...prev,
                    context: {
                      ...prev.context,
                      [key]: Math.round(Number(event.target.value) || limit.min),
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
