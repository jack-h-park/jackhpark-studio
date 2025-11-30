"use client";

import type { FormEvent, KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import styles from "./ChatInputBar.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export function ChatInputBar({
  value,
  onChange,
  onSubmit,
  disabled = false,
}: Props) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disabled) {
      onSubmit();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled) {
        onSubmit();
      }
    }
  };

  return (
    <form className={styles.inputBar} onSubmit={handleSubmit}>
      <Textarea
        placeholder="Ask anything about Jack’s work..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <div className={styles.inputBarRow}>
        <Button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className={styles.inputBarSend}
        >
          {disabled ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
