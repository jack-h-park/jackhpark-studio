import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiChevronDown } from "@react-icons/all-files/fi/FiChevronDown";
import { FiChevronRight } from "@react-icons/all-files/fi/FiChevronRight";
import { useState } from "react";

import type { HistoryPreviewResult } from "@/lib/chat/historyWindowPreview";
import { cn } from "@/lib/utils";
import { type ChatMessage } from "@/components/chat/hooks/useChatSession";
import { isDevOnly } from "@/lib/dev/devFlags";

import { HistoryPreviewDiffPanel } from "./HistoryPreviewDiffPanel";

const CLIENT_ESTIMATE_LABEL = "Estimate (client)";

type Props = {
  preview: HistoryPreviewResult;
  messages?: ChatMessage[];
  isSummaryEnabled?: boolean;
  className?: string;
  serverPreview?: HistoryPreviewResult | null;
  showServerPreview?: boolean;
  showTitle?: boolean;
};

export function HistoryPreview({
  preview,
  messages = [],
  isSummaryEnabled = false,
  className = "",
  serverPreview,
  showServerPreview = false,
  showTitle = true,
}: Props) {
  // Check for discrepancies if server preview is active
  const hasDiff =
    showServerPreview &&
    serverPreview &&
    (preview.includedCount !== serverPreview.includedCount ||
      preview.includedIndices?.length !==
        serverPreview.includedIndices?.length);

  const isClientPreviewEmpty =
    preview.includedCount === 0 && preview.excludedCount === 0;
  const isServerPreviewEmpty =
    !!serverPreview &&
    serverPreview.includedCount === 0 &&
    serverPreview.excludedCount === 0;
  const isEmptyPreview =
    isClientPreviewEmpty &&
    (!showServerPreview || !serverPreview || isServerPreviewEmpty);

  const containerClasses = isEmptyPreview
    ? "bg-[color:var(--ai-bg-surface-muted)] border border-[color:var(--ai-border-subtle)]"
    : "bg-[var(--ai-bg-surface-sunken)] border border-[var(--ai-border-subtle)]";

  const diffLabel = (
    <span className="flex items-center gap-1 text-[var(--ai-text-warning)] text-xs font-medium">
      <FiAlertTriangle /> Diff detected
    </span>
  );
  const previewLegend =
    "Client estimate uses a lightweight heuristic; flip on the dev-only server preview toggle to compare against the backend counts.";

  return (
    <div
      className={`mt-3 p-3 rounded text-sm space-y-4 ${containerClasses} ${className}`}
    >
      {/* Header */}
      {showTitle ? (
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[var(--ai-text-default)]">
            History Preview
          </span>
          {hasDiff && diffLabel}
        </div>
      ) : (
        hasDiff && (
          <div className="flex items-center justify-end">
            {diffLabel}
          </div>
        )
      )}
      {isEmptyPreview && (
        <p className="text-[11px] text-[color:var(--ai-text-muted)] italic">
          No history yet. Start chatting to see what’s included.
        </p>
      )}

      <div
        className={`grid items-stretch ${
          showServerPreview
            ? "grid-cols-2 gap-0 divide-x divide-[var(--ai-border-strong)]"
            : "grid-cols-1 gap-0"
        }`}
      >
        <div className="px-3 py-2">
          {/* Client Estimate Pane */}
          <PreviewPane
            label={CLIENT_ESTIMATE_LABEL}
            preview={preview}
            messages={messages}
            isSummaryEnabled={isSummaryEnabled}
            isPreviewEmpty={isClientPreviewEmpty}
          />
        </div>

        {/* Server Exact Pane (Dev Only) */}
        {showServerPreview && (
          <div className="px-3 py-2">
            <PreviewPane
              label="Exact (server) [DEV]"
              preview={serverPreview}
              messages={messages}
              isSummaryEnabled={isSummaryEnabled}
              isLoading={!serverPreview}
              isPreviewEmpty={isServerPreviewEmpty}
            />
          </div>
        )}
      </div>

      <p className="text-[10px] text-[var(--ai-text-muted)] italic leading-tight">
        {previewLegend}
      </p>
      {showServerPreview && isDevOnly() && <HistoryPreviewDiffPanel />}
    </div>
  );
}

function PreviewPane({
  label,
  preview,
  messages,
  isSummaryEnabled,
  isLoading,
  isPreviewEmpty,
  className,
}: {
  label: string;
  preview: HistoryPreviewResult | null | undefined;
  messages: ChatMessage[];
  isSummaryEnabled: boolean;
  isLoading?: boolean;
  isPreviewEmpty?: boolean;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading || !preview) {
    return (
      <div className={cn("space-y-2 opacity-50", className)}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-[var(--ai-text-muted)] uppercase tracking-wider">
            {label}
          </span>
        </div>
        <div className="text-[var(--ai-text-muted)] italic text-xs">
          Loading...
        </div>
      </div>
    );
  }

  const { includedCount, excludedCount, includedIndices } = preview;
  const listToggleLabel = isOpen ? "Hide included messages" : "Show included messages";

  const includedClass = cn(
    "font-mono",
    isPreviewEmpty
      ? "text-[11px] text-[color:var(--ai-text-muted)]"
      : includedCount === 0
        ? "text-[var(--ai-text-muted)]"
        : "font-semibold text-sm text-[var(--ai-text-default)]",
  );
  const excludedClass = cn(
    "font-mono text-xs",
    isPreviewEmpty
      ? "text-[color:var(--ai-text-muted)]"
      : excludedCount > 0
        ? "text-[var(--ai-text-warning)]"
        : "text-[var(--ai-text-muted)]",
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-[var(--ai-text-muted)] uppercase tracking-wider">
          {label}
        </span>
      </div>

      <dl className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-4 text-[var(--ai-text-default)]">
          <dt className="text-xs text-[var(--ai-text-muted)]">Included</dt>
          <dd className={includedClass}>{includedCount}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 text-[var(--ai-text-muted)]">
          <dt className="text-xs text-[var(--ai-text-muted)]">Excluded</dt>
          <dd className={excludedClass}>{excludedCount}</dd>
        </div>
      </dl>

      {includedIndices && includedIndices.length > 0 && messages.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--ai-divider)]/50">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 text-[11px] font-medium text-[var(--ai-text-muted)] hover:text-[var(--ai-text-default)] w-full text-left"
            aria-pressed={isOpen}
            aria-label={listToggleLabel}
          >
            {isOpen ? <FiChevronDown /> : <FiChevronRight />}
            {listToggleLabel}
          </button>

          {isOpen && (
            <div className="mt-2 space-y-1.5 pl-1 max-h-[200px] overflow-y-auto">
              {includedIndices.map((idx) => {
                const msg = messages[idx];
                if (!msg) return null;
                return (
                  <div
                    key={idx}
                    className="text-[10px] grid grid-cols-[20px_45px_1fr] gap-1 items-baseline"
                  >
                    <span className="text-[var(--ai-text-muted)] font-mono">
                      #{idx + 1}
                    </span>
                    <span className="uppercase tracking-wide text-[var(--ai-text-muted)] font-semibold shrink-0 truncate">
                      {msg.role}
                    </span>
                    <span
                      className="text-[var(--ai-text-default)] truncate"
                      title={msg.content}
                    >
                      {truncateContent(msg.content)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isSummaryEnabled && (
        <div className="mt-1 text-[10px] text-[var(--ai-text-muted)] italic leading-tight">
          May be summarized.
        </div>
      )}
    </div>
  );
}

function truncateContent(text: string, length = 80) {
  if (!text) return "";
  return text.length > length ? text.slice(0, length) + "..." : text;
}
