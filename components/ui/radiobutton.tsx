import type { ReactNode } from "react";

import { cn } from "./utils";

type RadiobuttonVariant = "tile" | "chip";

export type RadiobuttonProps = {
  name?: string;
  value: string;
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  variant?: RadiobuttonVariant;
  className?: string;
  onChange: () => void;
};

export function Radiobutton({
  name,
  value,
  label,
  description,
  checked,
  disabled,
  variant = "tile",
  className,
  onChange,
}: RadiobuttonProps) {
  const variantClass = variant === "chip" ? "ai-radio--chip" : undefined;
  const stateClass = checked ? "ai-radio--active" : "ai-radio--inactive";
  const disabledClass = disabled ? "ai-radio--disabled" : undefined;

  return (
    <label
      className={cn(
        "ai-radio",
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
        onChange={onChange}
      />
      <div className="flex flex-col">
        <span className="ai-radio__label block mb-1">{label}</span>
        {description ? (
          <p className="ai-radio__description ai-meta-text">{description}</p>
        ) : null}
      </div>
    </label>
  );
}

Radiobutton.displayName = "Radiobutton";
