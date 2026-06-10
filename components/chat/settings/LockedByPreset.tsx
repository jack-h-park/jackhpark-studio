import type * as React from "react";

import { cn } from "@/components/ui/utils";

/**
 * Shared presentation for preset-locked settings in the chat settings drawer.
 * Sections must use these instead of re-implementing the badge/notice markup
 * so locked states look identical everywhere.
 */

export function ManagedByPresetBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border border-ai-fg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-ai-fg-muted",
        className,
      )}
    >
      Managed by Preset
    </span>
  );
}

export function LockedByPresetNotice({
  children,
}: {
  children: React.ReactNode;
}) {
  return <p className="text-xs text-[color:var(--ai-text-muted)]">{children}</p>;
}
