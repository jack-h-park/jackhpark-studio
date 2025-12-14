import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiChevronDown } from "@react-icons/all-files/fi/FiChevronDown";
import { FiChevronRight } from "@react-icons/all-files/fi/FiChevronRight";
import { useState } from "react";

import type { HistoryPreviewResult } from "@/lib/chat/historyWindowPreview";
import { type ChatMessage } from "@/components/chat/hooks/useChatSession";
import { isDevOnly } from "@/lib/dev/devFlags";

import { HistoryPreviewDiffPanel } from "./HistoryPreviewDiffPanel";

type Props = {
  preview: HistoryPreviewResult;
  messages?: ChatMessage[];
  isSummaryEnabled?: boolean;
  className?: string;
  serverPreview?: HistoryPreviewResult | null;
  showServerPreview?: boolean;
};

export function HistoryPreview({
  preview,
  messages = [],
  isSummaryEnabled = false,
  className = "",
  serverPreview,
  showServerPreview = false,
}: Props) {
  // Check for discrepancies if server preview is active
  const hasDiff =
    showServerPreview &&
    serverPreview &&
    (preview.includedCount !== serverPreview.includedCount ||
      preview.includedIndices?.length !==
        serverPreview.includedIndices?.length);

  return (
    <div
      className={`mt-3 p-3 rounded bg-[var(--ai-bg-surface-sunken)] border border-[var(--ai-border-default)] text-sm space-y-4 ${className}`}
    >
      {/* Header */}
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

      <div
        className={`grid ${showServerPreview ? "grid-cols-2 gap-4" : "grid-cols-1"}`}
      >
        {/* Client Estimate Pane */}
        <PreviewPane
          label="Estimate (client)"
          preview={preview}
          messages={messages}
          isSummaryEnabled={isSummaryEnabled}
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
}: {
  label: string;
  preview: HistoryPreviewResult | null | undefined;
  messages: ChatMessage[];
  isSummaryEnabled: boolean;
  isLoading?: boolean;
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
          <span className="font-medium">{includedCount}</span>
        </div>
        <div className="flex justify-between text-[var(--ai-text-muted)]">
          <span className="text-xs">Excluded:</span>
          <span
            className={`text-xs ${excludedCount > 0 ? "text-[var(--ai-text-warning)]" : ""}`}
          >
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
