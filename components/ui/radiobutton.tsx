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

const variantContainerClasses: Record<RadiobuttonVariant, string> = {
  tile:
    "flex flex-col items-start gap-1 rounded-2xl border px-4 py-3 text-left transition focus-within:outline focus-within:outline-2 focus-within:outline-[color:var(--ai-accent)]",
  chip:
    "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition focus-within:outline focus-within:outline-2 focus-within:outline-[color:var(--ai-accent)]",
};

const variantCheckedClasses: Record<RadiobuttonVariant, string> = {
  tile:
    "border-[color:var(--ai-accent)] bg-[color:var(--ai-accent-bg)] shadow-[0_8px_20px_rgba(15,15,15,0.2)]",
  chip:
    "border-[color:var(--ai-accent)] bg-[color:var(--ai-accent-bg)] text-[color:var(--ai-accent-strong)]",
};

const variantUncheckedClasses: Record<RadiobuttonVariant, string> = {
  tile:
    "border-[color:var(--ai-border)] bg-[color:var(--ai-bg-muted)] hover:border-[color:var(--ai-text-strong)]",
  chip:
    "border-[color:var(--ai-border)] bg-transparent text-[color:var(--ai-text-strong)] hover:border-[color:var(--ai-border-strong)]",
};

const variantLabelClasses: Record<RadiobuttonVariant, string> = {
  tile: "text-sm font-semibold",
  chip: "font-semibold text-[color:var(--ai-text-strong)]",
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
  const containerClasses = cn(
    variantContainerClasses[variant],
    checked ? variantCheckedClasses[variant] : variantUncheckedClasses[variant],
    disabled && "pointer-events-none opacity-60",
    className,
  );

  const labelClasses = variantLabelClasses[variant];
  const labelColorClass =
    variant === "tile"
      ? checked
        ? "text-[color:var(--ai-accent-strong)]"
        : "text-[color:var(--ai-text-strong)]"
      : undefined;

  return (
    <label className={containerClasses}>
      <input
        className="sr-only"
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className={cn(labelClasses, labelColorClass)}>
        {label}
      </span>
      {description && (
        <p className="ai-meta-text text-xs">{description}</p>
      )}
    </label>
  );
}

Radiobutton.displayName = "Radiobutton";
