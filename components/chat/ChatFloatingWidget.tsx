"use client";

import { useState } from "react";

import { ChatFloatingWindow } from "@/components/chat/ChatFloatingWindow";

import styles from "./ChatFloatingWidget.module.css";

export function ChatFloatingWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={styles.container}>
      <ChatFloatingWindow isOpen={isOpen} onClose={() => setIsOpen(false)} />
      <button
        type="button"
        className={styles.button}
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
