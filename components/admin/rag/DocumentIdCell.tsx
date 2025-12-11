import { FiCheck } from "@react-icons/all-files/fi/FiCheck";
import { FiCopy } from "@react-icons/all-files/fi/FiCopy";
import { useCallback, useMemo, useState } from "react";

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

function copyToClipboard(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }

  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  return Promise.resolve();
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
  const rawMissingText =
    rawMissingLabel ?? (short ? "—" : "(not available)");

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
    <div className={className}>
      <div className="flex items-center gap-2 text-[color:var(--ai-text-muted)]">
        <span className="ai-label-overline text-[color:var(--ai-text-muted)]">
          Raw
        </span>
        <span
          className="truncate text-xs font-mono text-[color:var(--ai-text)]"
          title={rawValue ?? undefined}
        >
          {rawDisplay}
        </span>
        {showRawCopy && rawValue ? (
          <button
            type="button"
            onClick={() => handleCopy("raw")}
            className="flex h-6 w-6 items-center justify-center rounded border border-[color:var(--ai-border-soft)] text-sm text-[color:var(--ai-text-muted)] transition hover:border-[color:var(--ai-border)] hover:text-[color:var(--ai-text)]"
            aria-label="Copy raw document ID"
          >
            {copied === "raw" ? (
              <FiCheck className="text-green-500" />
            ) : (
              <FiCopy />
            )}
          </button>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="ai-label-overline text-[color:var(--ai-text-muted)]">
          Canonical
        </span>
        <span
          className="truncate text-xs font-mono text-[color:var(--ai-text)]"
          title={canonicalId}
        >
          {canonicalDisplay}
        </span>
        <button
          type="button"
          onClick={() => handleCopy("canonical")}
          className="flex h-6 w-6 items-center justify-center rounded border border-[color:var(--ai-border-soft)] text-sm text-[color:var(--ai-text-muted)] transition hover:border-[color:var(--ai-border)] hover:text-[color:var(--ai-text)]"
          aria-label="Copy canonical document ID"
        >
          {copied === "canonical" ? (
            <FiCheck className="text-green-500" />
          ) : (
            <FiCopy />
          )}
        </button>
      </div>
    </div>
  );
}
