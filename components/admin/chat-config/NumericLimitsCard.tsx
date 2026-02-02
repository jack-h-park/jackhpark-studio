import { FiSliders } from "@react-icons/all-files/fi/FiSliders";

import type { AdminChatConfig, AdminNumericLimit } from "@/types/chat-config";
import { ChatConfigCardHeader } from "@/components/admin/chat-config/ChatConfigHelpers";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { numericLimitLabels } from "@/hooks/use-admin-chat-config";

export type NumericLimitsCardProps = {
  numericLimits: AdminChatConfig["numericLimits"];
  numericLimitErrors: string[];
  hasNumericErrors: boolean;
  updateNumericLimit: (
    key: keyof AdminChatConfig["numericLimits"],
    field: keyof AdminNumericLimit,
    value: number,
  ) => void;
};

export function NumericLimitsCard({
  numericLimits,
  numericLimitErrors,
  hasNumericErrors,
  updateNumericLimit,
}: NumericLimitsCardProps) {
  return (
    <Card>
      <ChatConfigCardHeader
        icon={<FiSliders aria-hidden="true" />}
        title="Numeric Limits"
        description="Guardrail the possible values session presets can reach."
      />
      <CardContent className="space-y-5 px-5 py-4">
        {(
          Object.keys(numericLimits) as Array<
            keyof AdminChatConfig["numericLimits"]
          >
        ).map((key) => {
          const limit = numericLimits[key];
          return (
            <div
              key={key}
              className="rounded-2xl border border-[var(--ai-role-border-muted)] p-4 shadow-sm sm:p-5"
            >
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))]">
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-semibold leading-snug">
                    {numericLimitLabels[key]}
                  </p>
                  <p className="ai-field__description">
                    Set guardrails for this value across presets.
                  </p>
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.5em] text-[color:var(--ai-text-muted)]">
                    Min ≤ Default ≤ Max
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
            </div>
          );
        })}
        {hasNumericErrors && (
          <p className="mt-2 rounded-xl border border-[var(--ai-error)] bg-[var(--ai-error-muted)] px-4 py-2 text-sm text-[var(--ai-error)]">
            {numericLimitErrors[0]}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
