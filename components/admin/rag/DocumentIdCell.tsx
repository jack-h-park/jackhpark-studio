import { FiCheck } from "@react-icons/all-files/fi/FiCheck";
import { FiCheckCircle } from "@react-icons/all-files/fi/FiCheckCircle";
import { FiCopy } from "@react-icons/all-files/fi/FiCopy";
import { FiSlash } from "@react-icons/all-files/fi/FiSlash";
import { useCallback, useMemo, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/components/ui/utils";
import { copyToClipboard } from "@/lib/clipboard";

type DocumentIdCellProps = {
  canonicalId: string;
  rawId?: string | null;
  short?: boolean;
  className?: string;
  showRawCopy?: boolean;
  rawMissingLabel?: string;
  compact?: boolean;
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

const copyAriaLabel = (target: "canonical" | "raw") =>
  target === "raw" ? "Copy raw document ID" : "Copy canonical document ID";

export function DocumentIdCell({
  canonicalId,
  rawId,
  short = true,
  className,
  showRawCopy,
  rawMissingLabel,
  compact = false,
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

  const renderTooltipLabel = (target: "canonical" | "raw") =>
    copied === target
      ? "Copied!"
      : target === "raw"
        ? "Copy RAW ID"
        : "Copy CANONICAL ID";

  const copyButtonClass =
    "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border border-[var(--ai-border-soft)] text-[var(--ai-text-muted)] transition hover:border-[var(--ai-border)] hover:text-[var(--ai-text)]";

  const renderCopyIcon = (target: "canonical" | "raw") => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => handleCopy(target)}
          className={copyButtonClass}
          aria-label={copyAriaLabel(target)}
        >
          {copied === target ? (
            <FiCheck className="text-[var(--ai-success)]" />
          ) : (
            <FiCopy />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{renderTooltipLabel(target)}</TooltipContent>
    </Tooltip>
  );

  const renderRawStatusIcon = () => {
    const hasRaw = Boolean(rawValue);
    const Icon = hasRaw ? FiCheckCircle : FiSlash;
    const tooltipText = hasRaw ? "RAW available" : "RAW not available";
    const iconColor = hasRaw
      ? "text-[color:var(--ai-success)]"
      : "text-[color:var(--ai-text-muted)]";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={tooltipText}
            className={cn(
              "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full",
              iconColor,
            )}
          >
            <Icon className="h-3 w-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltipText}</TooltipContent>
      </Tooltip>
    );
  };

  const renderRow = ({
    label,
    value,
    title,
    target,
  }: {
    label: string;
    value: string;
    title?: string;
    target?: "canonical" | "raw";
  }) => (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1 pr-1">
        <span className="ai-label-overline text-[color:var(--ai-text-muted)]">
          {label}
        </span>
        <p
          className="truncate text-xs font-mono text-[color:var(--ai-text)]"
          title={title}
        >
          {value}
        </p>
      </div>
      {target ? renderCopyIcon(target) : null}
    </div>
  );

  const containerClass = compact
    ? "flex flex-col gap-1"
    : "space-y-3 rounded-[var(--ai-radius-lg)] border border-[var(--ai-border-muted)] bg-[var(--ai-role-surface-muted)] p-3";

  if (compact) {
    return (
      <div className={cn(containerClass, className)}>
        <div className="flex items-center justify-between gap-2">
          <span className="ai-label-overline text-[color:var(--ai-text-muted)]">
            Identifier
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {renderRawStatusIcon()}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p
            className="min-w-0 truncate text-xs font-mono text-[color:var(--ai-text)]"
            title={canonicalId}
          >
            {canonicalDisplay}
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {renderCopyIcon("canonical")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(containerClass, className)}>
      {renderRow({
        label: "Raw",
        value: rawDisplay,
        title: rawValue ?? undefined,
        target: showRawCopy && rawValue ? "raw" : undefined,
      })}
      {renderRow({
        label: "Canonical",
        value: canonicalDisplay,
        title: canonicalId,
        target: "canonical",
      })}
    </div>
  );
}
