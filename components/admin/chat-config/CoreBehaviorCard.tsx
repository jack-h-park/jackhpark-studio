import { FiSettings } from "@react-icons/all-files/fi/FiSettings";

import type { AdminChatConfig } from "@/types/chat-config";
import { ChatConfigCardHeader } from "@/components/admin/chat-config/ChatConfigHelpers";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type CoreBehaviorCardProps = {
  config: AdminChatConfig;
  updateConfig: (updater: (prev: AdminChatConfig) => AdminChatConfig) => void;
  additionalPromptMaxLength: number;
};

export function CoreBehaviorCard({
  config,
  updateConfig,
  additionalPromptMaxLength,
}: CoreBehaviorCardProps) {
  const handleBaseSummaryChange = (nextValue: string) => {
    updateConfig((prev) => ({
      ...prev,
      baseSystemPromptSummary: nextValue,
    }));
  };

  const handleBaseSystemPromptChange = (nextValue: string) => {
    updateConfig((prev) => ({
      ...prev,
      baseSystemPrompt: nextValue,
    }));
  };

  const handleAdditionalPromptMaxLengthChange = (nextValue: string) => {
    updateConfig((prev) => ({
      ...prev,
      additionalPromptMaxLength: Number(nextValue) || 0,
    }));
  };

  return (
    <Card>
      <ChatConfigCardHeader
        icon={<FiSettings aria-hidden="true" />}
        title="Core Behavior &amp; Base Prompt"
        description="Define the base system prompt plus the user-facing summary shown in the chat settings drawer."
      />
      <CardContent className="space-y-5 px-5 py-4">
        <div className="space-y-4 rounded-2xl border border-[var(--ai-role-border-muted)] bg-[var(--ai-role-surface-1)] p-4">
          <p className="ai-label-overline ai-label-overline--muted">
            Behavior rules
          </p>
          <div className="space-y-5">
            <div className="ai-field">
              <Label htmlFor="coreSummary" className="ai-field__label">
                Base system prompt summary
              </Label>
              <Textarea
                id="coreSummary"
                aria-describedby="core-summary-description"
                value={config.baseSystemPromptSummary ?? ""}
                onChange={(event) =>
                  handleBaseSummaryChange(event.target.value)
                }
                rows={3}
                className="w-full max-w-[64ch]"
              />
              <p
                id="core-summary-description"
                className="ai-field__description"
              >
                Shown in the chat settings drawer. End users never see the full
                base system prompt.
              </p>
            </div>
            <div className="ai-field">
              <Label htmlFor="baseSystemPrompt" className="ai-field__label">
                Base system prompt (admin-only)
              </Label>
              <Textarea
                id="baseSystemPrompt"
                value={config.baseSystemPrompt ?? ""}
                onChange={(event) =>
                  handleBaseSystemPromptChange(event.target.value)
                }
                rows={4}
                className="w-full max-w-[64ch]"
              />
            </div>
          </div>
        </div>
        <div className="space-y-3 rounded-2xl border border-[var(--ai-role-border-muted)] bg-[var(--ai-role-surface-1)] p-4">
          <p className="ai-label-overline ai-label-overline--muted">
            Length limits
          </p>
          <div className="ai-field">
            <Label
              htmlFor="additionalPromptMaxLength"
              className="ai-field__label"
            >
              Additional prompt max length
            </Label>
            <Input
              id="additionalPromptMaxLength"
              type="number"
              min={0}
              value={additionalPromptMaxLength}
              onChange={(event) =>
                handleAdditionalPromptMaxLengthChange(event.target.value)
              }
              className="w-full max-w-[12rem]"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
