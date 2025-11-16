"use client";

import type {
  AdminChatConfig,
  SessionChatConfig,
} from "@/types/chat-config";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
};

export function SettingsSectionUserPrompt({
  adminConfig,
  sessionConfig,
  setSessionConfig,
}: Props) {
  return (
    <section className="settings-section">
      <p className="settings-section__title">User System Prompt</p>
      <textarea
        className="settings-section__textarea"
        value={sessionConfig.userSystemPrompt}
        maxLength={adminConfig.userSystemPromptMaxLength}
        onChange={(event) =>
          setSessionConfig((prev) => ({
            ...prev,
            userSystemPrompt: event.target.value,
            appliedPreset: undefined,
          }))
        }
      />
      <p className="settings-section__hint">
        {sessionConfig.userSystemPrompt.length}/
        {adminConfig.userSystemPromptMaxLength} characters
      </p>
    </section>
  );
}
