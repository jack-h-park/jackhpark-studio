"use client";

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
      <p className="settings-section__title">Context &amp; History</p>
      <div className="settings-section__field">
        {inputs.map(({ key, label, limit }) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={limit.min}
              max={limit.max}
              className="settings-section__number"
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
          </label>
        ))}
      </div>
    </section>
  );
}
