"use client";

import type { FormEvent, RefObject } from "react";
import { AiOutlineSend } from "@react-icons/all-files/ai/AiOutlineSend";
import { VscDebugStop } from "@react-icons/all-files/vsc/VscDebugStop";

import styles from "./ChatInputBar.module.css";

export type ChatInputBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading: boolean;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
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
  placeholder = "Ask me anything about Jack...",
}: ChatInputBarProps) {
  const isInputDisabled = isLoading || disabled;
  const isSubmitDisabled = isInputDisabled || value.trim().length === 0;

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

  return (
    <form className={styles.chatInputForm} onSubmit={handleSubmit}>
      <input
        className={styles.chatInput}
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={isInputDisabled}
      />
      <button
        type="submit"
        className={styles.chatSubmitButton}
        disabled={!isLoading && isSubmitDisabled}
        aria-label={isLoading ? "Stop generation" : "Send message"}
      >
        {isLoading ? <VscDebugStop size={20} /> : <AiOutlineSend size={20} />}
      </button>
    </form>
  );
}
