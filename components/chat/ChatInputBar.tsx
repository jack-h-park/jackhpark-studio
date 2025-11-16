"use client";

import type { FormEvent, KeyboardEvent } from "react";

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
    <form className="chat-input-bar" onSubmit={handleSubmit}>
      <textarea
        className="chat-input-bar__textarea"
        placeholder="Ask anything about Jack’s work..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        className="chat-input-bar__button"
      >
        {disabled ? "Sending…" : "Send"}
      </button>
      <style jsx>{`
        .chat-input-bar {
          padding: 24px;
          border-top: 1px solid #e2e8f0;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .chat-input-bar__textarea {
          width: 100%;
          min-height: 90px;
          border-radius: 18px;
          border: 1px solid #cbd5f5;
          padding: 16px;
          font-size: 0.95rem;
          color: #0f172a;
          background: #f8fafc;
          resize: vertical;
          font-family: inherit;
        }
        .chat-input-bar__textarea:focus {
          outline: none;
          border-color: #94a3b8;
          background: #ffffff;
        }
        .chat-input-bar__button {
          align-self: flex-end;
          border-radius: 999px;
          border: none;
          padding: 12px 32px;
          font-weight: 600;
          font-size: 0.95rem;
          background: #0f172a;
          color: #ffffff;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .chat-input-bar__button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .chat-input-bar__button:not(:disabled):hover {
          background: #111827;
        }
      `}</style>
    </form>
  );
}
