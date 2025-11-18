"use client";

import { useState } from "react";

import { ChatWindow } from "@/components/chat/ChatWindow";

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="ai-chat-panel-container">
      <ChatWindow isOpen={isOpen} onClose={() => setIsOpen(false)} />
      <button
        type="button"
        className="ai-chat-panel-button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? "Close chat assistant" : "Open chat assistant"}
      >
        <img
          src="/android-chrome-512x512.png"
          alt="Assistant Icon"
          style={{ width: "100%", height: "100%" }}
        />
      </button>
    </div>
  );
}
