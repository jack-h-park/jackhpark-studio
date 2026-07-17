"use client";

import { AiOutlineCheck } from "@react-icons/all-files/ai/AiOutlineCheck";
import { AiOutlineCopy } from "@react-icons/all-files/ai/AiOutlineCopy";
import { AiOutlineReload } from "@react-icons/all-files/ai/AiOutlineReload";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./ChatMessagesPanel.module.css";

export type ChatMessageActionsProps = {
  /** Raw message text copied to the clipboard. */
  content: string;
  /** Present only on the latest assistant message; hides the button otherwise. */
  onRegenerate?: (() => Promise<void>) | null;
  /** Error responses get a "Try again" label instead of "Regenerate". */
  isError?: boolean;
  disabled?: boolean;
};

export function ChatMessageActions({
  content,
  onRegenerate,
  isError = false,
  disabled = false,
}: ChatMessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    let succeeded = false;
    try {
      await navigator.clipboard.writeText(content);
      succeeded = true;
    } catch {
      // Async Clipboard API can be blocked (embedded webviews, permissions).
      // Fall back to the legacy selection-based copy before giving up.
      const scratch = document.createElement("textarea");
      scratch.value = content;
      scratch.setAttribute("readonly", "");
      scratch.style.position = "fixed";
      scratch.style.opacity = "0";
      document.body.append(scratch);
      scratch.select();
      try {
        succeeded = document.execCommand("copy");
      } catch {
        succeeded = false;
      }
      scratch.remove();
    }
    if (!succeeded) {
      return;
    }
    setCopied(true);
    if (copiedTimerRef.current) {
      clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const showCopy = !isError && content.trim().length > 0;
  const regenerateLabel = isError ? "Try again" : "Regenerate";

  if (!showCopy && !onRegenerate) {
    return null;
  }

  return (
    <div className={styles.messageActionsRow}>
      {showCopy && (
        <button
          type="button"
          className={styles.messageActionButton}
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy response"}
          title={copied ? "Copied" : "Copy response"}
        >
          {copied ? (
            <AiOutlineCheck aria-hidden="true" />
          ) : (
            <AiOutlineCopy aria-hidden="true" />
          )}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      )}
      {onRegenerate && (
        <button
          type="button"
          className={styles.messageActionButton}
          onClick={() => void onRegenerate()}
          disabled={disabled}
          aria-label={regenerateLabel}
          title={
            isError
              ? "Send the last question again"
              : "Generate a new answer to the last question"
          }
        >
          <AiOutlineReload aria-hidden="true" />
          <span>{regenerateLabel}</span>
        </button>
      )}
    </div>
  );
}
