import * as React from "react";

import { Input } from "./input";
import { Label } from "./label";
import { cn } from "./utils";

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
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className={cn("ai-field", className)}>
      <Label htmlFor={id} className="ai-field__label">
        {label}
      </Label>
      {description ? (
        <p id={descriptionId} className="ai-field__description">
          {description}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <input
          id={`${id}-range`}
          type="range"
          className="ai-range flex-[3]"
          min={min}
          max={max}
          step={stepValue}
          disabled={disabled}
          value={value}
          aria-describedby={descriptionId}
          aria-label={`${label} slider`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <Input
          id={id}
          type="number"
          className="ai-field-sm flex-[1] ai-settings-section__number ai-settings-section__number--compact"
          min={min}
          max={max}
          step={stepValue}
          disabled={disabled}
          value={value}
          aria-describedby={descriptionId}
          aria-label={`${label} value`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
