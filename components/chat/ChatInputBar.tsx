"use client";

import { AiOutlineSend } from "@react-icons/all-files/ai/AiOutlineSend";
import { VscDebugStop } from "@react-icons/all-files/vsc/VscDebugStop";
import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
} from "react";

import styles from "./ChatInputBar.module.css";

// Keep in sync with the server-side guard in lib/server/api/langchain_chat_impl_heavy.ts.
export const MAX_MESSAGE_LENGTH = 2000;
// Show the remaining-character counter only once the user approaches the cap,
// so the common short-question path stays visually quiet.
const COUNTER_VISIBLE_THRESHOLD = MAX_MESSAGE_LENGTH - 200;
const MAX_TEXTAREA_HEIGHT_PX = 160;

export type ChatInputBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading: boolean;
  disabled?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
};

export function ChatInputBar({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  disabled = false,
  inputRef,
  placeholder = "Ask about Jack’s projects, AI architecture, or experience…",
}: ChatInputBarProps) {
  const isInputDisabled = isLoading || disabled;
  const isSubmitDisabled = isInputDisabled || value.trim().length === 0;
  const showCounter = value.length >= COUNTER_VISIBLE_THRESHOLD;

  // Auto-grow the textarea with its content, capped so long drafts scroll.
  const resizeTextarea = useCallback(() => {
    const el = inputRef?.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
    // Only show the scrollbar once the draft exceeds the height cap.
    el.style.overflowY =
      el.scrollHeight > MAX_TEXTAREA_HEIGHT_PX ? "auto" : "hidden";
  }, [inputRef]);

  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading && onStop) {
      onStop();
      return;
    }
    if (isSubmitDisabled) {
      return;
    }
    onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline. Skip while composing
    // (IME input, e.g. Korean) so Enter confirms the composition instead.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!isSubmitDisabled) {
        onSubmit();
      }
    }
  };

  return (
    <>
      <form className={styles.chatInputForm} onSubmit={handleSubmit}>
        <div className={styles.chatInputWrap}>
          <textarea
            className={styles.chatInput}
            ref={inputRef}
            value={value}
            onChange={(event) =>
              onChange(event.target.value.slice(0, MAX_MESSAGE_LENGTH))
            }
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isInputDisabled}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            aria-label="Chat message"
          />
          {showCounter && (
            <span className={styles.chatInputCounter} aria-live="polite">
              {value.length} / {MAX_MESSAGE_LENGTH}
            </span>
          )}
        </div>
        <button
          type="submit"
          className={styles.chatSubmitButton}
          disabled={!isLoading && isSubmitDisabled}
          aria-label={isLoading ? "Stop generation" : "Send message"}
        >
          {isLoading ? <VscDebugStop size={20} /> : <AiOutlineSend size={20} />}
        </button>
      </form>
      <p className={styles.chatInputNotice}>
        Conversations may be recorded to improve this service.
      </p>
    </>
  );
}
