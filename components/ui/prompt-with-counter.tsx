import { Label } from "@/components/ui/label";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PromptWithCounterProps = {
  id?: string;
  label: string;
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
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-start justify-between gap-2">
        <Label htmlFor={id} className={cn("ai-field__label", labelClassName)}>
          {label}
        </Label>
        <span className={cn("ai-meta-text text-xs", counterClassName)}>
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
        {...textareaProps}
      />
      {helperText ? (
        <p className={cn("ai-field__description", helperClassName)}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
