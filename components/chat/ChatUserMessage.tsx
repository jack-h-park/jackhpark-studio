"use client";

import { AiOutlineEdit } from "@react-icons/all-files/ai/AiOutlineEdit";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import type { ChatMessage } from "@/components/chat/hooks/useChatSession";
import { formatMessageTime } from "@/lib/chat/format-message-time";

import styles from "./ChatMessagesPanel.module.css";

export type ChatUserMessageProps = {
  message: ChatMessage;
  bubble: React.ReactNode;
  /** Absent while a request is in flight, disabling edit for that turn. */
  onEdit?: ((messageId: string, newContent: string) => Promise<void>) | null;
};

export function ChatUserMessage({ message, bubble, onEdit }: ChatUserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        // Place the caret at the end and size the box to the content.
        el.setSelectionRange(el.value.length, el.value.length);
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
    }
  }, [isEditing]);

  const startEditing = () => {
    setDraft(message.content);
    setIsEditing(true);
  };

  const cancel = () => {
    setIsEditing(false);
    setDraft(message.content);
  };

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed || !onEdit) {
      cancel();
      return;
    }
    if (trimmed === message.content.trim()) {
      cancel();
      return;
    }
    setIsEditing(false);
    void onEdit(message.id, trimmed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  };

  if (isEditing) {
    return (
      <div className={styles.userEditContainer}>
        <textarea
          ref={textareaRef}
          className={styles.userEditTextarea}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            const el = event.target;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          onKeyDown={handleKeyDown}
          aria-label="Edit your message"
        />
        <div className={styles.userEditActions}>
          <button
            type="button"
            className={styles.userEditCancel}
            onClick={cancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.userEditSave}
            onClick={submit}
            disabled={draft.trim().length === 0}
          >
            Save &amp; submit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.userMessageWrap}>
      {bubble}
      <div className={styles.userMessageMeta}>
        {onEdit && (
          <button
            type="button"
            className={styles.userEditButton}
            onClick={startEditing}
            aria-label="Edit message"
            title="Edit message"
          >
            <AiOutlineEdit aria-hidden="true" />
          </button>
        )}
        {message.createdAt && (
          <time
            className={styles.messageTimestamp}
            dateTime={new Date(message.createdAt).toISOString()}
          >
            {formatMessageTime(message.createdAt)}
          </time>
        )}
      </div>
    </div>
  );
}
