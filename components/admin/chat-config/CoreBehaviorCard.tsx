import { FiSettings } from "@react-icons/all-files/fi/FiSettings";

import type { AdminChatConfig } from "@/types/chat-config";
import {
  ChatConfigCardContent,
  ChatConfigCardHeader,
  ConfigBox,
} from "@/components/admin/chat-config/ChatConfigHelpers";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type CoreBehaviorCardProps = {
  config: AdminChatConfig;
  updateConfig: (updater: (prev: AdminChatConfig) => AdminChatConfig) => void;
};

export function CoreBehaviorCard({
  config,
  updateConfig,
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

  return (
    <Card>
      <ChatConfigCardHeader
        icon={<FiSettings aria-hidden="true" />}
        title="Core Behavior &amp; Base Prompt"
        description="Define the base system prompt plus the user-facing summary shown in the chat settings drawer."
      />
      <ChatConfigCardContent className="space-y-5">
        <ConfigBox className="space-y-4">
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
                className="w-full max-w-none"
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
                className="w-full max-w-none"
              />
            </div>
          </div>
        </ConfigBox>
      </ChatConfigCardContent>
    </Card>
  );
}
