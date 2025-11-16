"use client";

import { FcAssistant } from "@react-icons/all-files/fc/FcAssistant";
import { useState } from "react";
import css from "styled-jsx/css";

import { ChatWindow } from "@/components/chat/ChatWindow";

const styles = css`
  .chat-panel-container {
    position: fixed;
    bottom: 60px;
    right: 30px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
  }

  .chat-panel-button {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s ease-in-out;
  }

  .chat-panel-button:hover {
    transform: scale(1.1);
  }

  .chat-panel-button :global(svg) {
    width: 36px;
    height: 36px;
    color: #0a4584ff;
  }

  @media (max-width: 480px) {
    .chat-panel-container {
      bottom: 24px;
      right: 16px;
    }
  }
`;

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="chat-panel-container">
        <ChatWindow isOpen={isOpen} onClose={() => setIsOpen(false)} />
        <button
          type="button"
          className="chat-panel-button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={isOpen ? "Close chat assistant" : "Open chat assistant"}
        >
          <FcAssistant />
        </button>
      </div>
      <style jsx>{styles}</style>
    </>
  );
}
