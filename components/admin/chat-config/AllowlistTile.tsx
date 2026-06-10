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

/**
 * Multi-select tile: button + aria-pressed with a check-circle marker.
 * The check-circle is reserved for multi-select groups — single-choice groups
 * must use the radio-based SelectableTile (components/shared/selectable-tile).
 * See "Selection Controls" in docs/canonical/design-system/ai-design-system.md.
 */
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
        "ai-selectable ai-selectable--hoverable relative flex flex-col items-start justify-center gap-2 px-3 py-3 min-h-[3.25rem] text-left transition focus-ring",
        selected ? "ai-selectable--active" : "",
        disabled && "ai-selectable--disabled",
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {selected && (
        <span
          className="ai-check-circle absolute top-2 right-2 scale-100 opacity-100"
          aria-hidden="true"
        >
          ✓
        </span>
      )}
      <div className="ai-choice">
        <span className="ai-choice__label-row">
          <span
            className={cn(
              "ai-choice__label",
              selected ? "font-semibold" : "font-normal",
            )}
          >
            {label}
          </span>
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
