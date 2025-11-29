"use client";

import { FiType } from "@react-icons/all-files/fi/FiType";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { Textarea } from "@/components/ui/textarea";

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
    <section className="ai-panel ai-settings-section">
      <HeadingWithIcon
        as="p"
        icon={<FiType aria-hidden="true" />}
        className="ai-settings-section__title"
      >
        User System Prompt
      </HeadingWithIcon>
      <Textarea
        className="min-h-[110px]"
        value={sessionConfig.userSystemPrompt}
        maxLength={adminConfig.userSystemPromptMaxLength}
        rows={4}
        onChange={(event) =>
          setSessionConfig((prev) => ({
            ...prev,
            userSystemPrompt: event.target.value,
            appliedPreset: undefined,
          }))
        }
      />
      <p className="ai-meta-text">
        {sessionConfig.userSystemPrompt.length}/
        {adminConfig.userSystemPromptMaxLength} characters
      </p>
    </section>
  );
}
