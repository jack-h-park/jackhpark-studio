"use client";

import Image from "next/image";

import type { ChatMessage } from "@/components/chat/hooks/useChatSession";
import { ChatMessageItem } from "@/components/chat/ChatMessageItem";

import styles from "./ChatMessagesPanel.module.css";

export type ChatMessagesPanelProps = {
  messages: ChatMessage[];
  isLoading?: boolean;
  loadingAssistantId?: string | null;
  showTelemetry?: boolean;
  showCitations?: boolean;
  showPlaceholder?: boolean;
  citationLinkLength?: number;
  onRetryDeepSearch?: (messageId: string) => void;
};

export function ChatMessagesPanel({
  messages,
  isLoading = false,
  loadingAssistantId = null,
  showTelemetry = false,
  showCitations = false,
  showPlaceholder = true,
  citationLinkLength = 24,
  onRetryDeepSearch,
}: ChatMessagesPanelProps) {
  if (messages.length === 0) {
    if (showPlaceholder) {
      return (
        <div className={styles.messagesPanel}>
          <div className="flex flex-1 justify-center items-center">
            <Image
              src="/images/7FAD09AA-76ED-4C18-A8E9-34D81940A59E.png"
              alt="AI Assistant"
              width={200}
              height={200}
            />
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {messages.map((m, i) => (
        <ChatMessageItem
          key={m.id}
          message={m}
          isLoading={isLoading}
          loadingAssistantId={loadingAssistantId}
          showTelemetry={showTelemetry}
          showCitations={showCitations}
          citationLinkLength={citationLinkLength}
          onRetryDeepSearch={
            i === messages.length - 1 ? onRetryDeepSearch : undefined
          }
        />
      ))}
    </>
  );
}
