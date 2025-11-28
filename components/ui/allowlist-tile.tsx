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
        "ai-allowlist-tile",
        selected ? "ai-allowlist-tile--selected" : "ai-allowlist-tile--idle",
        disabled && "ai-allowlist-tile--disabled",
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="ai-allowlist-tile__label-row">
        <span className="font-semibold ai-allowlist-tile__label-text">
          {label}
        </span>
        {selected && (
          <span
            className="ai-allowlist-tile__check align-middle"
            aria-hidden="true"
          >
            ✓
          </span>
        )}
      </span>
      {subtitle && (
        <span className="block text-[0.65rem] font-mono uppercase tracking-[0.2em] text-[color:var(--ai-text-muted)]">
          {subtitle}
        </span>
      )}
    </button>
  );
}
