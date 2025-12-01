"use client";

import { FiType } from "@react-icons/all-files/fi/FiType";

import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { PromptWithCounter } from "@/components/ui/prompt-with-counter";
import {
  type AdminChatConfig,
  getAdditionalPromptMaxLength,
  type SessionChatConfig,
} from "@/types/chat-config";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
};

export function SettingsSectionSessionAdditionalPrompt({
  adminConfig,
  sessionConfig,
  setSessionConfig,
}: Props) {
  const maxLength = getAdditionalPromptMaxLength(adminConfig);
  const helperText = [
    "Optional prompt applied only to this chat session.",
    "Based on the preset default and added on top of the base system prompt.",
    `Up to ${maxLength} characters.`,
  ].join(" ");

  return (
    <section className="ai-setting-section">
      <HeadingWithIcon
        as="p"
        icon={<FiType aria-hidden="true" />}
        className="ai-setting-section-header flex items-center justify-between gap-3"
      >
        User system prompt
      </HeadingWithIcon>
      <PromptWithCounter
        label="User system prompt"
        value={sessionConfig.additionalSystemPrompt ?? ""}
        maxLength={maxLength}
        helperText={helperText}
        helperClassName="ai-setting-section-description"
        onChange={(value) =>
          setSessionConfig((prev) => ({
            ...prev,
            additionalSystemPrompt: value,
            appliedPreset: undefined,
          }))
        }
        textareaClassName="min-h-[110px]"
      />
    </section>
  );
}
