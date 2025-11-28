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
  const stateClass = checked
    ? "border-[var(--ai-accent)] bg-[var(--ai-accent-bg)] shadow-[var(--ai-shadow-soft)]"
    : "hover:border-[color-mix(in_srgb,var(--ai-text)_60%,transparent)]";
  const disabledClass = disabled ? "opacity-65 cursor-not-allowed" : "";

  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-[var(--ai-radius-lg)] border border-[hsl(var(--ai-border))] bg-[hsl(var(--ai-bg-muted))] cursor-pointer transition-all duration-200 ease-linear",
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
      <div className="flex flex-col">
        <span className="block mb-1 font-semibold text-[var(--ai-text)]">
          {label}
        </span>
        {description ? (
          <p className="text-xs text-[var(--ai-text-muted)] leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
    </label>
  );
}

Radiobutton.displayName = "Radiobutton";
