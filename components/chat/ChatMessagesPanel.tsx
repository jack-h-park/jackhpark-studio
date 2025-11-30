"use client";

import Image from "next/image";

import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";

import styles from "./ChatMessagesPanel.module.css";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

type Props = {
  messages: ChatMessage[];
};

export function ChatMessagesPanel({ messages }: Props) {
  return (
    <div className={styles.messagesPanel}>
      {messages.length === 0 ? (
        <div className="flex flex-1 justify-center items-center">
          <Image
            src="/images/7FAD09AA-76ED-4C18-A8E9-34D81940A59E.png"
            alt="AI Assistant"
            width={200}
            height={200}
          />
        </div>
      ) : (
        messages.map((message) => (
          <Card
            key={message.id}
            className={cn(
              styles.chatMessage,
              message.role === "assistant"
                ? styles.chatMessageAssistant
                : styles.chatMessageUser,
              message.isError ? styles.chatMessageError : undefined,
            )}
          >
            <div className="ai-meta-text uppercase tracking-[0.25em]">
              {message.role === "assistant" ? "Assistant" : "You"}
            </div>
            <p className="text-base leading-7 text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
              {message.content}
            </p>
          </Card>
        ))
      )}
    </div>
  );
}
