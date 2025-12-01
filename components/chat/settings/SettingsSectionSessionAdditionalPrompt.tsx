"use client";

import { FiType } from "@react-icons/all-files/fi/FiType";

import { PromptWithCounter } from "@/components/ui/prompt-with-counter";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";
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
    <Section>
      <SectionHeader>
        <SectionTitle as="p" icon={<FiType aria-hidden="true" />}>
          User system prompt
        </SectionTitle>
      </SectionHeader>
      <SectionContent>
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
      </SectionContent>
    </Section>
  );
}
