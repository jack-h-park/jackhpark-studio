"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";

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
    <div className="ai-chat-messages-panel">
      {messages.map((message) => (
        <Card
          key={message.id}
          className={cn(
            "ai-chat-message",
            message.role === "assistant"
              ? "ai-chat-message--assistant"
              : "ai-chat-message--user",
            message.isError ? "ai-chat-message--error" : undefined,
          )}
        >
          <div className="ai-chat-message__label">
            {message.role === "assistant" ? "Assistant" : "You"}
          </div>
          <p className="ai-chat-message__content">{message.content}</p>
        </Card>
      ))}
    </div>
  );
}
