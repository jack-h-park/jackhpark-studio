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
  /** Optional formatter for the value badge, e.g. v.toFixed(2) */
  formatValue?: (value: number) => string;
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
  formatValue,
  description,
  className,
}: SliderNumberFieldProps) {
  const stepValue = step ?? 1;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      <div className="flex items-center gap-3">
        <input
          id={`${id}-range`}
          type="range"
          className="w-full"
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
          className="ai-field-sm ai-settings-section__number ai-settings-section__number--compact max-w-[110px] text-right"
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
