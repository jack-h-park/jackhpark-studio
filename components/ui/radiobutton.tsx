import type { ReactNode } from "react";

import { cn } from "./utils";

type RadiobuttonVariant = "tile" | "chip";

export type RadiobuttonProps<Value extends string = string> = {
  name?: string;
  value: Value;
  label: ReactNode;
  description?: ReactNode;
  /** Rendered above (align="center") or beside (align="start") the label. */
  icon?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  variant?: RadiobuttonVariant;
  /** "start" = left-aligned row; "center" = stacked, centered tile content. */
  align?: "start" | "center";
  className?: string;
  descriptionClassName?: string;
  onChange: (value: Value) => void;
};

export function Radiobutton<Value extends string = string>({
  name,
  value,
  label,
  description,
  icon,
  checked,
  disabled,
  variant = "tile",
  align = "start",
  className,
  descriptionClassName,
  onChange,
}: RadiobuttonProps<Value>) {
  const variantClass = variant === "chip" ? "py-2 px-3" : "p-3";
  const stateClass = checked ? "ai-selectable--active" : "";
  const disabledClass = disabled ? "ai-selectable--disabled" : "";
  const alignClass =
    align === "center"
      ? "items-center justify-center text-center"
      : "items-start gap-3";

  return (
    <label
      className={cn(
        "flex cursor-pointer ai-selectable ai-selectable--hoverable",
        alignClass,
        variantClass,
        stateClass,
        disabledClass,
        className,
      )}
    >
      <input
        className="sr-only"
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <div
        className={cn(
          "ai-choice",
          align === "center" && "items-center text-center !gap-1 w-full",
        )}
      >
        {icon}
        <span
          className={cn(
            "ai-choice__label",
            checked ? "font-semibold" : "font-normal",
          )}
        >
          {label}
        </span>
        {description && (
          <p className={cn("ai-choice__description", descriptionClassName)}>
            {description}
          </p>
        )}
      </div>
    </label>
  );
}

Radiobutton.displayName = "Radiobutton";
