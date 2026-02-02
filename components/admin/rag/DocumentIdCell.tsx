import { FiCheck } from "@react-icons/all-files/fi/FiCheck";
import { FiCopy } from "@react-icons/all-files/fi/FiCopy";
import { useCallback, useMemo, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/components/ui/utils";
import { copyToClipboard } from "@/lib/clipboard";

type DocumentIdCellProps = {
  canonicalId: string;
  rawId?: string | null;
  short?: boolean;
  className?: string;
  showRawCopy?: boolean;
  rawMissingLabel?: string;
};

const ID_SHORT_HEAD = 8;
const ID_SHORT_TAIL = 4;

function abbreviateId(value: string, short: boolean): string {
  if (!short) {
    return value;
  }

  if (value.length <= ID_SHORT_HEAD + ID_SHORT_TAIL) {
    return value;
  }

  return `${value.slice(0, ID_SHORT_HEAD)}…${value.slice(-ID_SHORT_TAIL)}`;
}

export function DocumentIdCell({
  canonicalId,
  rawId,
  short = true,
  className,
  showRawCopy,
  rawMissingLabel,
}: DocumentIdCellProps) {
  const [copied, setCopied] = useState<"canonical" | "raw" | null>(null);
  const rawMissingText = rawMissingLabel ?? (short ? "—" : "(not available)");

  const rawValue = rawId ?? null;

  const canonicalDisplay = useMemo(
    () => abbreviateId(canonicalId, short),
    [canonicalId, short],
  );
  const rawDisplay = useMemo(
    () => (rawValue ? abbreviateId(rawValue, short) : rawMissingText),
    [rawValue, rawMissingText, short],
  );

  const handleCopy = useCallback(
    (target: "canonical" | "raw") => {
      const value = target === "canonical" ? canonicalId : rawValue;
      if (!value) {
        return;
      }

      void copyToClipboard(value);
      setCopied(target);
      setTimeout(() => setCopied(null), 1500);
    },
    [canonicalId, rawValue],
  );

  return (
    <div
      className={cn(
        "space-y-3 rounded-[var(--ai-radius-lg)] border border-[var(--ai-border-muted)] bg-[var(--ai-role-surface-muted)] p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="ai-label-overline text-[color:var(--ai-text-muted)]">
            Raw
          </span>
          <p
            className="truncate text-xs font-mono text-[color:var(--ai-text)]"
            title={rawValue ?? undefined}
          >
            {rawDisplay}
          </p>
        </div>
        {showRawCopy && rawValue ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleCopy("raw")}
                className="flex h-6 w-6 items-center justify-center rounded border border-[var(--ai-border-soft)] text-[var(--ai-text-muted)] transition hover:border-[var(--ai-border)] hover:text-[var(--ai-text)]"
                aria-label="Copy raw document ID"
              >
                {copied === "raw" ? (
                  <FiCheck className="text-[var(--ai-success)]" />
                ) : (
                  <FiCopy />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Copy RAW ID</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-[color:var(--ai-text-muted)]">
            {rawMissingText}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="ai-label-overline text-[color:var(--ai-text-muted)]">
            Canonical
          </span>
          <p
            className="truncate text-xs font-mono text-[color:var(--ai-text)]"
            title={canonicalId}
          >
            {canonicalDisplay}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => handleCopy("canonical")}
              className="flex h-6 w-6 items-center justify-center rounded border border-[var(--ai-border-soft)] text-[var(--ai-text-muted)] transition hover:border-[var(--ai-border)] hover:text-[var(--ai-text)]"
              aria-label="Copy canonical document ID"
            >
              {copied === "canonical" ? (
                <FiCheck className="text-[var(--ai-success)]" />
              ) : (
                <FiCopy />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Copy CANONICAL ID</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
