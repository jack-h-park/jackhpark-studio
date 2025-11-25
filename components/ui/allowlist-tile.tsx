import type { MouseEventHandler, ReactNode } from "react";

import { cn } from "@/lib/utils";

type AllowlistTileProps = {
  id: string;
  label: ReactNode;
  subtitle?: ReactNode;
  description?: string;
  selected: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  className?: string;
};

export function AllowlistTile({
  id,
  label,
  subtitle,
  description,
  selected,
  onClick,
  className,
}: AllowlistTileProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={description ?? `Use ${id}`}
      className={cn(
        "ai-allowlist-tile",
        selected
          ? "ai-allowlist-tile--selected"
          : "ai-allowlist-tile--idle",
        className,
      )}
      onClick={onClick}
    >
      <span className="font-semibold">{label}</span>
      {subtitle && (
        <span className="block text-[0.65rem] font-mono uppercase tracking-[0.2em] text-[color:var(--ai-text-muted)]">
          {subtitle}
        </span>
      )}
    </button>
  );
}
