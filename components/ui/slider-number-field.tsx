import * as React from "react";

import { cn } from "./utils";
import { Input } from "./input";
import { Label } from "./label";

export type SliderNumberFieldProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  /** Optional helper text below the label */
  description?: string;
  /** Optional container className */
  className?: string;
};

export function SliderNumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
  description,
  className,
}: SliderNumberFieldProps) {
  const stepValue = step ?? 1;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
      </div>
      {description ? (
        <p className="text-xs ai-text-muted">{description}</p>
      ) : null}
      <div className="flex items-center gap-3">
        <input
          id={`${id}-range`}
          type="range"
          className="ai-range"
          min={min}
          max={max}
          step={stepValue}
          disabled={disabled}
          value={value}
          aria-label={`${label} slider`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <Input
          id={id}
          type="number"
          className="ai-field-sm ai-settings-section__number ai-settings-section__number--compact"
          min={min}
          max={max}
          step={stepValue}
          disabled={disabled}
          value={value}
          aria-label={`${label} value`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
