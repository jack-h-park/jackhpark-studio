import { FiSliders } from "@react-icons/all-files/fi/FiSliders";

import type { AdminChatConfig, AdminReasoningEffort } from "@/types/chat-config";
import {
  ChatConfigCardContent,
  ChatConfigCardHeader,
} from "@/components/admin/chat-config/ChatConfigHelpers";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Radiobutton } from "@/components/ui/radiobutton";

const REASONING_EFFORT_OPTIONS: Array<{
  value: AdminReasoningEffort;
  label: string;
  description: string;
}> = [
  { value: "provider-default", label: "Provider default", description: "Use the model's default reasoning setting." },
  { value: "none", label: "None", description: "Minimize reasoning tokens for the lowest latency and cost." },
  { value: "low", label: "Low", description: "Use limited reasoning for latency-sensitive answers." },
  { value: "medium", label: "Medium", description: "Use balanced reasoning for supported models." },
  { value: "high", label: "High", description: "Use more reasoning when the quality gain justifies the cost." },
];

export function GenerationControlsCard({
  generation,
  isFormBusy,
  updateConfig,
}: {
  generation: NonNullable<AdminChatConfig["generation"]>;
  isFormBusy: boolean;
  updateConfig: (updater: (prev: AdminChatConfig) => AdminChatConfig) => void;
}) {
  return (
    <Card>
      <ChatConfigCardHeader
        icon={<FiSliders aria-hidden="true" />}
        title="Generation controls"
        description="Control reasoning for supported OpenAI models. Temperature remains provider-managed for GPT-5.6."
      />
      <ChatConfigCardContent className="space-y-4">
        <div className="ai-field">
          <Label className="ai-field__label">Reasoning effort</Label>
          <div className="space-y-1">
            {REASONING_EFFORT_OPTIONS.map((option) => (
              <Radiobutton
                key={option.value}
                name="generation-reasoning-effort"
                value={option.value}
                label={option.label}
                description={option.description}
                checked={generation.reasoningEffort === option.value}
                disabled={isFormBusy}
                onChange={(value) =>
                  updateConfig((prev) => ({
                    ...prev,
                    generation: {
                      reasoningEffort: value as AdminReasoningEffort,
                    },
                  }))
                }
              />
            ))}
          </div>
          <p className="ai-field__description">
            This is applied only to models that support reasoning effort. Other models keep their existing behavior.
          </p>
        </div>
      </ChatConfigCardContent>
    </Card>
  );
}
