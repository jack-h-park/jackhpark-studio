import { FiSliders } from "@react-icons/all-files/fi/FiSliders";

import type { AdminChatConfig, AdminNumericLimit } from "@/types/chat-config";
import {
  ChatConfigCardContent,
  ChatConfigCardHeader,
} from "@/components/admin/chat-config/ChatConfigHelpers";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { numericLimitLabels } from "@/hooks/use-admin-chat-config";

const numericLimitDescriptions: Record<
  keyof AdminChatConfig["numericLimits"],
  string
> = {
  ragTopK: "How many knowledge-base passages can be retrieved per answer.",
  similarityThreshold:
    "Minimum similarity (0–1) a passage needs to be used. Higher is stricter.",
  contextBudget:
    "Token budget for retrieved context included in each prompt.",
  historyBudget:
    "Token budget for prior conversation turns included in each prompt.",
  clipTokens: "Maximum tokens kept per message before clipping.",
};

export type NumericLimitsCardProps = {
  numericLimits: AdminChatConfig["numericLimits"];
  numericLimitErrors: string[];
  updateNumericLimit: (
    key: keyof AdminChatConfig["numericLimits"],
    field: keyof AdminNumericLimit,
    value: number,
  ) => void;
};

export function NumericLimitsCard({
  numericLimits,
  numericLimitErrors,
  updateNumericLimit,
}: NumericLimitsCardProps) {
  return (
    <Card>
      <ChatConfigCardHeader
        icon={<FiSliders aria-hidden="true" />}
        title="Numeric Limits"
        description="Guardrail the possible values session presets can reach."
      />
      <ChatConfigCardContent className="space-y-5">
        {(
          Object.keys(numericLimits) as Array<
            keyof AdminChatConfig["numericLimits"]
          >
        ).map((key) => {
          const limit = numericLimits[key];
          const rowError = numericLimitErrors.find((e) =>
            e.toLowerCase().startsWith(numericLimitLabels[key].toLowerCase()),
          );
          return (
            <div
              key={key}
              className="rounded-2xl border border-[var(--ai-role-border-muted)] p-4 shadow-sm sm:p-5"
            >
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))]">
                <div className="flex flex-col justify-center gap-1">
                  <p className="ai-label-emphasis leading-snug">
                    {numericLimitLabels[key]}
                  </p>
                  <p className="ai-helper-text">
                    {numericLimitDescriptions[key]}
                  </p>
                </div>
                <div className="ai-field min-w-0">
                  <Label htmlFor={`${key}-min`} className="ai-field__label">
                    Min
                  </Label>
                  <Input
                    id={`${key}-min`}
                    type="number"
                    value={limit.min}
                    onChange={(event) =>
                      updateNumericLimit(
                        key,
                        "min",
                        Number(event.target.value) || 0,
                      )
                    }
                    min={key === "similarityThreshold" ? 0 : undefined}
                    max={key === "similarityThreshold" ? 1 : undefined}
                  />
                </div>
                <div className="ai-field min-w-0">
                  <Label htmlFor={`${key}-default`} className="ai-field__label">
                    Default
                  </Label>
                  <Input
                    id={`${key}-default`}
                    type="number"
                    value={limit.default}
                    onChange={(event) =>
                      updateNumericLimit(
                        key,
                        "default",
                        Number(event.target.value) || 0,
                      )
                    }
                    min={key === "similarityThreshold" ? 0 : undefined}
                    max={key === "similarityThreshold" ? 1 : undefined}
                    step={key === "similarityThreshold" ? 0.01 : 1}
                  />
                </div>
                <div className="ai-field min-w-0">
                  <Label htmlFor={`${key}-max`} className="ai-field__label">
                    Max
                  </Label>
                  <Input
                    id={`${key}-max`}
                    type="number"
                    value={limit.max}
                    onChange={(event) =>
                      updateNumericLimit(
                        key,
                        "max",
                        Number(event.target.value) || 0,
                      )
                    }
                    min={key === "similarityThreshold" ? 0 : undefined}
                    max={key === "similarityThreshold" ? 1 : undefined}
                  />
                </div>
              </div>
              {rowError && (
                <p className="mt-3 rounded-xl border border-[var(--ai-error)] bg-[var(--ai-error-muted)] px-4 py-2 text-sm text-[var(--ai-error)]">
                  {rowError}
                </p>
              )}
            </div>
          );
        })}
      </ChatConfigCardContent>
    </Card>
  );
}
