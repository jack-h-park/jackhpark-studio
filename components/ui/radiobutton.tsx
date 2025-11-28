import type { ReactNode } from "react";

import { cn } from "./utils";

type RadiobuttonVariant = "tile" | "chip";

export type RadiobuttonProps<Value extends string = string> = {
  name?: string;
  value: Value;
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  variant?: RadiobuttonVariant;
  className?: string;
  onChange: (value: Value) => void;
};

export function Radiobutton<Value extends string = string>({
  name,
  value,
  label,
  description,
  checked,
  disabled,
  variant = "tile",
  className,
  onChange,
}: RadiobuttonProps<Value>) {
  const variantClass = variant === "chip" ? "py-2 px-3" : "p-3";
  const stateClass = checked ? "ai-selectable--active" : "";
  const disabledClass = disabled ? "ai-selectable--disabled" : "";

  return (
    <label
      className={cn(
        "flex items-start gap-3 cursor-pointer ai-selectable ai-selectable--hoverable",
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
      <div className="ai-choice">
        <span className="ai-choice__label">{label}</span>
        {description && (
          <p className="ai-choice__description">{description}</p>
        )}
      </div>
    </label>
  );
}

Radiobutton.displayName = "Radiobutton";
