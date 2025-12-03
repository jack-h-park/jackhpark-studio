import type { MouseEventHandler, ReactNode } from "react";

import { cn } from "@/lib/utils";

type AllowlistTileProps = {
  id: string;
  label: ReactNode;
  subtitle?: ReactNode;
  description?: string;
  selected: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  className?: string;
};

export function AllowlistTile({
  id,
  label,
  subtitle,
  description,
  selected,
  onClick,
  disabled = false,
  className,
}: AllowlistTileProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={description ?? `Use ${id}`}
      className={cn(
        "ai-selectable ai-selectable--hoverable flex flex-col items-start justify-center gap-2 px-3 py-2 text-left transition focus-ring",
        selected ? "ai-selectable--active shadow-inner" : "",
        disabled && "ai-selectable--disabled",
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <div className="ai-choice">
        <span className="ai-choice__label-row w-full">
          <span className="ai-choice__label">{label}</span>
          {selected && (
            <span className="ai-check-circle align-middle" aria-hidden="true">
              ✓
            </span>
          )}
        </span>
        {description && <p className="ai-choice__description">{description}</p>}
      </div>
      {subtitle && (
        <span className="ai-label-overline ai-label-overline--small block">
          {subtitle}
        </span>
      )}
    </button>
  );
}
