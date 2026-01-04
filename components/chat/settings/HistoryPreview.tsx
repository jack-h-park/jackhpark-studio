import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiChevronDown } from "@react-icons/all-files/fi/FiChevronDown";
import { FiChevronRight } from "@react-icons/all-files/fi/FiChevronRight";
import { useState } from "react";

import type { HistoryPreviewResult } from "@/lib/chat/historyWindowPreview";
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

  const isEmptyPreview =
    preview &&
    preview.includedCount === 0 &&
    preview.excludedCount === 0 &&
    (!showServerPreview ||
      !serverPreview ||
      (serverPreview.includedCount === 0 &&
        serverPreview.excludedCount === 0));

  const containerClasses = isEmptyPreview
    ? "bg-[color:var(--ai-bg-surface-muted)] border border-[color:var(--ai-border-muted)]"
    : "bg-[var(--ai-bg-surface-sunken)] border border-[var(--ai-border-default)]";

  return (
    <div
      className={`mt-3 p-3 rounded text-sm space-y-4 ${containerClasses} ${className}`}
    >
      {/* Header */}
      {showTitle && (
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[var(--ai-text-default)]">
            History Preview
          </span>
          {hasDiff && (
            <span className="flex items-center gap-1 text-[var(--ai-text-warning)] text-xs font-medium">
              <FiAlertTriangle /> Diff detected
            </span>
          )}
        </div>
      )}
      {!showTitle && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--ai-text-muted)] uppercase tracking-wider">
            {CLIENT_ESTIMATE_LABEL}
          </span>
          {hasDiff && (
            <span className="flex items-center gap-1 text-[var(--ai-text-warning)] text-xs font-medium">
              <FiAlertTriangle /> Diff detected
            </span>
          )}
        </div>
      )}
      {isEmptyPreview && (
        <p className="text-[11px] text-[color:var(--ai-text-muted)] italic">
          No history yet. Start chatting to see what’s included.
        </p>
      )}

      <div
        className={`grid ${showServerPreview ? "grid-cols-2 gap-4" : "grid-cols-1"}`}
      >
        {/* Client Estimate Pane */}
        <PreviewPane
          label={CLIENT_ESTIMATE_LABEL}
          preview={preview}
          messages={messages}
          isSummaryEnabled={isSummaryEnabled}
          isPreviewEmpty={isEmptyPreview}
        />

        {/* Server Exact Pane (Dev Only) */}
        {showServerPreview && (
          <div className="border-l border-[var(--ai-border-default)] pl-4">
            <PreviewPane
              label="Exact (server) [DEV]"
              preview={serverPreview}
              messages={messages}
              isSummaryEnabled={isSummaryEnabled}
              isLoading={!serverPreview}
            />
          </div>
        )}
      </div>

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
}: {
  label: string;
  preview: HistoryPreviewResult | null | undefined;
  messages: ChatMessage[];
  isSummaryEnabled: boolean;
  isLoading?: boolean;
  isPreviewEmpty?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading || !preview) {
    return (
      <div className="space-y-2 opacity-50">
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

  const includedClass = isPreviewEmpty
    ? "text-[11px] text-[color:var(--ai-text-muted)]"
    : "font-medium text-[var(--ai-text-default)]";
  const excludedClass = [
    "text-xs",
    excludedCount > 0 ? "text-[var(--ai-text-warning)]" : "",
    isPreviewEmpty ? "text-[color:var(--ai-text-muted)]" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-[var(--ai-text-muted)] uppercase tracking-wider">
          {label}
        </span>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[var(--ai-text-default)]">
          <span className="text-xs">Included:</span>
          <span className={includedClass}>{includedCount}</span>
        </div>
        <div className="flex justify-between text-[var(--ai-text-muted)]">
          <span className="text-xs">Excluded:</span>
          <span className={excludedClass}>
            {excludedCount}
          </span>
        </div>
      </div>

      {includedIndices && includedIndices.length > 0 && messages.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--ai-border-default)]/50">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 text-[11px] font-medium text-[var(--ai-text-muted)] hover:text-[var(--ai-text-default)] w-full text-left"
          >
            {isOpen ? <FiChevronDown /> : <FiChevronRight />}
            Show list
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
