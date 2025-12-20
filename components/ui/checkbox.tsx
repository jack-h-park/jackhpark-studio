import * as React from "react";

import { useInteraction } from "./interaction-context";
import { cn } from "./utils";

export type CheckboxProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  readOnly?: boolean;
};

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    {
      className,
      checked = false,
      onCheckedChange,
      disabled,
      readOnly,
      ...props
    },
    ref,
  ) => {
    const interaction = useInteraction();
    const isDisabled = disabled || interaction.disabled;
    const isReadOnly = readOnly || interaction.readOnly;

    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        data-state={checked ? "checked" : "unchecked"}
        data-readonly={isReadOnly ? "true" : undefined}
        className={cn("ai-checkbox focus-ring", className)}
        onClick={(event) => {
          event.preventDefault();
          if (isDisabled || isReadOnly) {
            return;
          }
          onCheckedChange?.(!checked);
        }}
        disabled={isDisabled}
        ref={ref}
        {...props}
      >
        {checked && (
          <span
            className="flex items-center justify-center w-full h-full text-white"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 14 14"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="2 7 5.5 10.5 12 3" />
            </svg>
          </span>
        )}
      </button>
    );
  },
);
Checkbox.displayName = "Checkbox";

export type CheckboxChoiceProps = CheckboxProps & {
  label: React.ReactNode;
  description?: React.ReactNode;
  layout?: "inline" | "stacked";
  id?: string;
  readOnly?: boolean;
};

export function CheckboxChoice({
  label,
  description,
  layout = "inline",
  id,
  disabled,
  readOnly,
  className,
  ...checkboxProps
}: CheckboxChoiceProps) {
  const interaction = useInteraction();
  const isDisabled = disabled || interaction.disabled;
  const isReadOnly = readOnly || interaction.readOnly;

  const internalId = React.useId();
  const labelId = id ?? `${internalId}-label`;
  const checkboxRef = React.useRef<HTMLButtonElement | null>(null);

  const handleWrapperClick: React.MouseEventHandler<HTMLDivElement> = (
    event,
  ) => {
    if (isDisabled) return;

    if (
      event.target instanceof HTMLElement &&
      checkboxRef.current?.contains(event.target)
    ) {
      return;
    }

    checkboxRef.current?.click();
  };

  return (
    <div
      className={cn(
        "ai-choice__label-row",
        layout === "stacked" && "ai-choice__label-row--stacked",
        isDisabled && "opacity-60 cursor-not-allowed",
        isReadOnly && "ai-choice__label-row--readonly",
        className,
      )}
      onClick={handleWrapperClick}
      aria-disabled={isDisabled || undefined}
      data-readonly={isReadOnly || undefined}
    >
      <Checkbox
        ref={checkboxRef}
        aria-labelledby={labelId}
        disabled={disabled}
        readOnly={readOnly}
        {...checkboxProps}
      />
      <div className="flex flex-col gap-0.5">
        <span id={labelId} className="ai-choice__label">
          {label}
        </span>
        {description && (
          <span className="ai-choice__description">{description}</span>
        )}
      </div>
    </div>
  );
}
