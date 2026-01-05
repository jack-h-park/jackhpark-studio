import { type ReactNode, useId } from "react";

import { Label } from "@/components/ui/label";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PromptWithCounterProps = {
  id?: string;
  label: ReactNode;
  helperText?: string;
  value: string;
  maxLength: number;
  rows?: number;
  className?: string;
  labelClassName?: string;
  textareaClassName?: string;
  helperClassName?: string;
  counterClassName?: string;
  onChange: (value: string) => void;
  textareaProps?: Omit<TextareaProps, "value" | "onChange">;
};

export function PromptWithCounter({
  id,
  label,
  helperText,
  value,
  maxLength,
  rows = 4,
  className,
  labelClassName,
  textareaClassName,
  helperClassName,
  counterClassName,
  onChange,
  textareaProps,
}: PromptWithCounterProps) {
  const fallbackId = useId();
  const descriptionId = helperText ? `${id ?? fallbackId}-helper` : undefined;
  const { "aria-describedby": textareaAriaDescribedBy, ...restTextareaProps } =
    textareaProps ?? {};
  const combinedAriaDescribedBy = descriptionId
    ? textareaAriaDescribedBy
      ? `${textareaAriaDescribedBy} ${descriptionId}`
      : descriptionId
    : textareaAriaDescribedBy;
  return (
    <div className={cn("space-y-2 w-full", className)}>
      <div className="flex items-end gap-2 w-full">
        <Label htmlFor={id} className={cn("ai-field__label", labelClassName)}>
          {label}
        </Label>
        <span
          className={cn(
            "ai-meta-text text-xs ml-auto text-right pr-1",
            counterClassName,
          )}
        >
          {value.length} / {maxLength} characters
        </span>
      </div>
      <Textarea
        id={id}
        className={cn("min-h-[110px]", textareaClassName)}
        value={value}
        maxLength={maxLength}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={combinedAriaDescribedBy}
        {...restTextareaProps}
      />
      {helperText ? (
        <p
          id={descriptionId}
          className={cn("ai-field__description", helperClassName)}
        >
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
