import { FiSliders } from "@react-icons/all-files/fi/FiSliders";

import type { AdminChatConfig, AdminNumericLimit } from "@/types/chat-config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <CardHeader>
        <CardTitle icon={<FiSliders aria-hidden="true" />}>Numeric Limits</CardTitle>
        <CardDescription>Guardrail the possible values session presets can reach.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {(Object.keys(numericLimits) as Array<keyof AdminChatConfig["numericLimits"]>).map((key) => {
          const limit = numericLimits[key];
          return (
            <div key={key} className="rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold ">{numericLimitLabels[key]}</p>
                  <p className="ai-field__description">Set guardrails for this value across presets.</p>
                </div>
                <span className="text-[0.62rem] font-semibold uppercase tracking-[0.5em] text-slate-400 sm:text-right">
                  Min ≤ Default ≤ Max
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="ai-field">
                  <Label htmlFor={`${key}-min`} className="ai-field__label">
                    Min
                  </Label>
                  <Input
                    id={`${key}-min`}
                    type="number"
                    value={limit.min}
                    onChange={(event) =>
                      updateNumericLimit(key, "min", Number(event.target.value) || 0)
                    }
                    min={key === "similarityThreshold" ? 0 : undefined}
                    max={key === "similarityThreshold" ? 1 : undefined}
                  />
                </div>
                <div className="ai-field">
                  <Label htmlFor={`${key}-default`} className="ai-field__label">
                    Default
                  </Label>
                  <Input
                    id={`${key}-default`}
                    type="number"
                    value={limit.default}
                    onChange={(event) =>
                      updateNumericLimit(key, "default", Number(event.target.value) || 0)
                    }
                    min={key === "similarityThreshold" ? 0 : undefined}
                    max={key === "similarityThreshold" ? 1 : undefined}
                    step={key === "similarityThreshold" ? 0.01 : 1}
                  />
                </div>
                <div className="ai-field">
                  <Label htmlFor={`${key}-max`} className="ai-field__label">
                    Max
                  </Label>
                  <Input
                    id={`${key}-max`}
                    type="number"
                    value={limit.max}
                    onChange={(event) =>
                      updateNumericLimit(key, "max", Number(event.target.value) || 0)
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
          <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {numericLimitErrors[0]}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
